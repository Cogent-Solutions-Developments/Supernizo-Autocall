import 'server-only';

import { randomUUID } from 'node:crypto';

import {
  CallSchema,
  CallStatusSchema,
  type Call,
  type CallMediaFailureCode,
  type CallStatus,
  type CallType,
  type TrackingContext,
} from '@supernizo/shared';
import { Prisma, type CallStatus as PrismaCallStatus } from '@generated/prisma/client';

import { getDatabaseClient } from '@/server/db/client';
import { ConflictError, ForbiddenError, NotFoundError } from '@/server/errors/app-error';
import { getEnvironmentReadiness } from '@/server/env';
import { terminateLiveKitRoom } from '@/server/livekit/room-service';
import { logger } from '@/server/logging/logger';
import { getPresenceRepository } from '@/server/presence/presence-repository';
import { UpstashRealtimeProvider } from '@/server/realtime';

import { assertAgentCanStartCall, markAgentBusy, releaseAgent } from './agent-presence-service';
import { resolveTrackingContext } from './tracker-engagement-service';

const terminalStatuses: CallStatus[] = ['REJECTED', 'ENDED', 'MISSED', 'FAILED', 'CANCELLED'];

export type CallAction =
  'accept' | 'activate' | 'cancel' | 'connect' | 'end' | 'fail' | 'reject' | 'timeout';

export type CallTransitionOptions = Readonly<{
  scheduleOperationalSync?: ((task: () => Promise<void>) => void) | undefined;
}>;

const transitionTargets: Readonly<Record<CallAction, CallStatus>> = {
  accept: 'ACCEPTED',
  activate: 'ACTIVE',
  cancel: 'CANCELLED',
  connect: 'CONNECTING',
  end: 'ENDED',
  fail: 'FAILED',
  reject: 'REJECTED',
  timeout: 'MISSED',
};

const allowedTransitions: Readonly<Record<CallStatus, readonly CallAction[]>> = {
  ACCEPTED: ['cancel', 'connect', 'end', 'fail'],
  ACTIVE: ['end', 'fail'],
  CANCELLED: [],
  CONNECTING: ['activate', 'cancel', 'end', 'fail'],
  ENDED: [],
  FAILED: [],
  MISSED: [],
  REJECTED: [],
  RINGING: ['accept', 'cancel', 'fail', 'reject', 'timeout'],
};

const callSelect = {
  agent: { select: { displayName: true } },
  agentId: true,
  failureCode: true,
  id: true,
  requestedAt: true,
  roomName: true,
  sessionId: true,
  site: { select: { widgetAvatarUrl: true } },
  siteId: true,
  status: true,
  type: true,
  visitor: { select: { anonymousId: true } },
  visitorId: true,
} satisfies Prisma.CallSelect;

type SelectedCall = Prisma.CallGetPayload<{ select: typeof callSelect }>;

function mapCall(call: SelectedCall): Call {
  return CallSchema.parse({
    agentAvatarUrl: call.site.widgetAvatarUrl,
    agentDisplayName: call.agent?.displayName ?? null,
    id: call.id,
    requestedAt: call.requestedAt.toISOString(),
    roomName: call.roomName ?? `call_${call.id}`,
    siteId: call.siteId,
    status: call.status,
    type: call.type,
    visitorId: call.visitorId,
  });
}

function isTerminal(status: CallStatus): boolean {
  return terminalStatuses.includes(status);
}

export function getRingTimeoutSeconds(
  source: Readonly<Record<string, string | undefined>> = process.env,
): number {
  const parsed = Number.parseInt(source.CALL_RING_TIMEOUT_SECONDS ?? '30', 10);
  return Number.isInteger(parsed) && parsed >= 10 && parsed <= 120 ? parsed : 30;
}

export function getConnectionTimeoutSeconds(
  source: Readonly<Record<string, string | undefined>> = process.env,
): number {
  const parsed = Number.parseInt(source.CALL_CONNECTION_TIMEOUT_SECONDS ?? '90', 10);
  return Number.isInteger(parsed) && parsed >= 30 && parsed <= 300 ? parsed : 90;
}

export function isRingingCallExpired(
  requestedAt: Date,
  now = Date.now(),
  timeoutSeconds = getRingTimeoutSeconds(),
): boolean {
  return requestedAt.getTime() + timeoutSeconds * 1_000 <= now;
}

export function transitionCallStatus(current: CallStatus, action: CallAction): CallStatus {
  const target = transitionTargets[action];
  if (current === target) return current;
  if (!allowedTransitions[current].includes(action)) {
    throw new ConflictError(`A call in ${current} state cannot be ${action}ed.`);
  }
  return target;
}

export function staleCallAction(status: CallStatus): CallAction | null {
  if (status === 'RINGING') return 'timeout';
  return status === 'ACCEPTED' || status === 'CONNECTING' ? 'fail' : null;
}

function roomName(): string {
  return `call_${randomUUID().replaceAll('-', '')}`;
}

function buildCallParticipantLockQueries(
  agentId: string,
  visitorId: string,
): readonly [Prisma.Sql, Prisma.Sql] {
  return [
    Prisma.sql`SELECT id FROM "User" WHERE id = ${agentId} FOR UPDATE`,
    Prisma.sql`SELECT id FROM "Visitor" WHERE id = ${visitorId} FOR UPDATE`,
  ];
}

export async function lockCallParticipants(
  executeQuery: (query: Prisma.Sql) => Promise<unknown>,
  agentId: string,
  visitorId: string,
): Promise<void> {
  for (const query of buildCallParticipantLockQueries(agentId, visitorId)) {
    await executeQuery(query);
  }
}

async function assertCallEnabled(siteId: string, type: CallType): Promise<void> {
  const site = await getDatabaseClient().site.findUnique({
    where: { id: siteId },
    select: { audioCallEnabled: true, status: true, videoCallEnabled: true },
  });
  if (!site) throw new NotFoundError('The requested site does not exist.');
  if (site.status !== 'ACTIVE') throw new ForbiddenError('Calls are not enabled for this site.');
  if (
    (type === 'AUDIO' && !site.audioCallEnabled) ||
    (type === 'VIDEO' && !site.videoCallEnabled)
  ) {
    throw new ForbiddenError(
      `${type === 'AUDIO' ? 'Audio' : 'Video'} calls are disabled for this site.`,
    );
  }
}

async function emitCall(
  channel: string,
  type: 'call.incoming' | 'call.status',
  call: Call,
): Promise<void> {
  if (!getEnvironmentReadiness().realtime) return;
  await new UpstashRealtimeProvider().emitToChannel(channel, { type, call });
}

async function emitCallStatus(call: Call, visitorAnonymousId?: string): Promise<void> {
  const anonymousId =
    visitorAnonymousId ??
    (
      await getDatabaseClient().visitor.findUnique({
        where: { id: call.visitorId },
        select: { anonymousId: true },
      })
    )?.anonymousId;
  await Promise.all([
    emitCall(`call:${call.id}`, 'call.status', call),
    anonymousId
      ? emitCall(`visitor:${call.siteId}:${anonymousId}`, 'call.status', call)
      : Promise.resolve(),
  ]);
}

async function notifyCallStatus(call: Call, visitorAnonymousId?: string): Promise<void> {
  try {
    await emitCallStatus(call, visitorAnonymousId);
  } catch (error: unknown) {
    logger.log('error', 'call_status_delivery_failed', {
      callId: call.id,
      errorName: error instanceof Error ? error.name : 'UnknownError',
    });
  }
}

async function getSelectedCall(callId: string): Promise<SelectedCall | null> {
  return getDatabaseClient().call.findUnique({ where: { id: callId }, select: callSelect });
}

async function getMappedCall(callId: string): Promise<Call | null> {
  const call = await getSelectedCall(callId);
  return call ? mapCall(call) : null;
}

async function synchronizeCurrentCallOperationalState(callId: string): Promise<void> {
  const current = await getSelectedCall(callId);
  if (!current) return;
  const status = CallStatusSchema.parse(current.status);
  await Promise.all([
    status === 'CONNECTING' || status === 'ACTIVE'
      ? markAgentBusy(current.agentId)
      : isTerminal(status)
        ? releaseAgentIfAvailable(current.agentId)
        : Promise.resolve(),
    isTerminal(status) && current.roomName
      ? terminateLiveKitRoom(current.roomName)
      : Promise.resolve(),
  ]);
}

export async function runOrScheduleCallOperationalSync(
  callId: string,
  scheduler?: ((task: () => Promise<void>) => void) | undefined,
): Promise<void> {
  if (!scheduler) {
    await synchronizeCurrentCallOperationalState(callId);
    return;
  }
  scheduler(async () => {
    try {
      await synchronizeCurrentCallOperationalState(callId);
    } catch (error: unknown) {
      logger.log('error', 'call_operational_sync_failed', {
        callId,
        errorName: error instanceof Error ? error.name : 'UnknownError',
      });
    }
  });
}

type CreatedCallOperationalInput = Readonly<{
  agentId: string | null;
  call: Call;
  expiredCalls: readonly Readonly<{ agentId: string | null; call: Call }>[];
}>;

async function synchronizeCreatedCallOperationalState(
  input: CreatedCallOperationalInput,
): Promise<void> {
  await Promise.all([
    markAgentBusy(input.agentId),
    emitCall(`call:${input.call.id}`, 'call.status', input.call),
    ...input.expiredCalls.map(async (expiredCall) => {
      await releaseAgentIfAvailable(expiredCall.agentId);
      await notifyCallStatus(expiredCall.call);
    }),
  ]);
}

export async function runOrScheduleCreatedCallOperationalSync(
  input: CreatedCallOperationalInput,
  scheduler?: ((task: () => Promise<void>) => void) | undefined,
): Promise<void> {
  if (!scheduler) {
    await synchronizeCreatedCallOperationalState(input);
    return;
  }
  scheduler(async () => {
    try {
      await synchronizeCreatedCallOperationalState(input);
    } catch (error: unknown) {
      logger.log('error', 'call_created_operational_sync_failed', {
        callId: input.call.id,
        errorName: error instanceof Error ? error.name : 'UnknownError',
      });
    }
  });
}

async function expireStalePendingCalls(
  transaction: Prisma.TransactionClient,
  visitorId: string,
  agentId: string,
): Promise<SelectedCall[]> {
  const ringingCutoff = new Date(Date.now() - getRingTimeoutSeconds() * 1_000);
  const connectionCutoff = new Date(Date.now() - getConnectionTimeoutSeconds() * 1_000);
  const staleCalls = await transaction.call.findMany({
    where: {
      OR: [{ agentId }, { visitorId }],
      AND: [
        {
          OR: [
            { requestedAt: { lte: ringingCutoff }, status: 'RINGING' },
            {
              requestedAt: { lte: connectionCutoff },
              status: { in: ['ACCEPTED', 'CONNECTING'] },
            },
          ],
        },
      ],
    },
    select: { id: true, status: true },
  });
  if (staleCalls.length === 0) return [];

  const expiredCalls: Array<Readonly<{ id: string; status: 'FAILED' | 'MISSED' }>> = [];
  for (const staleCall of staleCalls) {
    const terminalStatus = staleCall.status === 'RINGING' ? 'MISSED' : 'FAILED';
    const result = await transaction.call.updateMany({
      where: { id: staleCall.id, status: staleCall.status },
      data: {
        endedAt: new Date(),
        failureCode: terminalStatus === 'MISSED' ? 'RING_TIMEOUT' : 'CONNECTION_TIMEOUT',
        status: terminalStatus,
      },
    });
    if (result.count === 1) expiredCalls.push({ id: staleCall.id, status: terminalStatus });
  }
  if (expiredCalls.length === 0) return [];

  await transaction.callEvent.createMany({
    data: expiredCalls.map((call) => ({ callId: call.id, type: call.status })),
  });
  return transaction.call.findMany({
    where: { id: { in: expiredCalls.map((call) => call.id) } },
    select: callSelect,
  });
}

async function expireCallIfNeeded(callId: string): Promise<Call | null> {
  const call = await getDatabaseClient().call.findUnique({
    where: { id: callId },
    select: { id: true, requestedAt: true, status: true },
  });
  if (!call) return null;
  if (call.status !== 'RINGING') return getMappedCall(callId);
  if (!isRingingCallExpired(call.requestedAt)) {
    return getMappedCall(callId);
  }

  const updated = await getDatabaseClient().$transaction(async (transaction) => {
    const result = await transaction.call.updateMany({
      where: { id: callId, status: 'RINGING' },
      data: { endedAt: new Date(), failureCode: 'RING_TIMEOUT', status: 'MISSED' },
    });
    if (result.count === 0) return null;
    await transaction.callEvent.create({ data: { callId, type: 'MISSED' } });
    return transaction.call.findUnique({ where: { id: callId }, select: callSelect });
  });
  if (!updated) return getMappedCall(callId);
  const typedCall = mapCall(updated);
  await Promise.all([
    releaseAgentIfAvailable(updated.agentId),
    notifyCallStatus(typedCall, updated.visitor.anonymousId),
  ]);
  return typedCall;
}

export async function createCall(
  input: Readonly<{
    agentId: string;
    siteId: string;
    type: CallType;
    visitorId: string;
  }>,
  options?: CallTransitionOptions,
): Promise<Call> {
  const [, , presence] = await Promise.all([
    assertAgentCanStartCall(input.agentId),
    assertCallEnabled(input.siteId, input.type),
    getPresenceRepository().get(input.siteId, input.visitorId),
  ]);
  if (!presence) throw new ConflictError('The visitor is no longer online.');

  const database = getDatabaseClient();
  const { call, expiredCalls, visitorAnonymousId } = await database.$transaction(
    async (transaction) => {
      await lockCallParticipants(
        (query) => transaction.$queryRaw(query),
        input.agentId,
        input.visitorId,
      );
      const expiredCalls = await expireStalePendingCalls(
        transaction,
        input.visitorId,
        input.agentId,
      );
      const [visitor, existingVisitorCall, existingAgentCall, session] = await Promise.all([
        transaction.visitor.findFirst({
          where: { id: input.visitorId, siteId: input.siteId },
          select: { anonymousId: true, id: true },
        }),
        transaction.call.findFirst({
          where: { status: { notIn: terminalStatuses }, visitorId: input.visitorId },
          select: { id: true },
        }),
        transaction.call.findFirst({
          where: { agentId: input.agentId, status: { notIn: terminalStatuses } },
          select: { id: true },
        }),
        transaction.session.findUnique({
          where: { anonymousSessionId: presence.sessionId },
          select: { id: true, visitorId: true },
        }),
      ]);
      if (!visitor || !session || session.visitorId !== visitor.id) {
        throw new ConflictError('The visitor presence record is no longer valid.');
      }
      if (existingVisitorCall) throw new ConflictError('This visitor already has an active call.');
      if (existingAgentCall) throw new ConflictError('The agent is busy with another call.');

      const call = await transaction.call.create({
        data: {
          agentId: input.agentId,
          events: { create: { type: 'RINGING' } },
          roomName: roomName(),
          sessionId: session.id,
          siteId: input.siteId,
          type: input.type,
          visitorId: input.visitorId,
        },
        select: callSelect,
      });
      return { call, expiredCalls, visitorAnonymousId: visitor.anonymousId };
    },
  );

  const typedCall = mapCall(call);
  await runOrScheduleCreatedCallOperationalSync(
    {
      agentId: call.agentId,
      call: typedCall,
      expiredCalls: expiredCalls.map((expiredCall) => ({
        agentId: expiredCall.agentId,
        call: mapCall(expiredCall),
      })),
    },
    options?.scheduleOperationalSync,
  );
  await emitCall(`visitor:${typedCall.siteId}:${visitorAnonymousId}`, 'call.incoming', typedCall);
  return typedCall;
}

export async function getCall(callId: string): Promise<Call | null> {
  return expireCallIfNeeded(callId);
}

export async function getCallScope(
  callId: string,
): Promise<Readonly<{ agentId: string | null; siteId: string }> | null> {
  return getDatabaseClient().call.findUnique({
    where: { id: callId },
    select: { agentId: true, siteId: true },
  });
}

export async function transitionCall(
  callId: string,
  action: CallAction,
  failureCode?: string,
  options?: CallTransitionOptions,
): Promise<Call> {
  const existing = await getSelectedCall(callId);
  if (!existing) throw new NotFoundError('The requested call does not exist.');
  return transitionSelectedCall(existing, action, failureCode, options);
}

async function transitionSelectedCall(
  selectedCall: SelectedCall,
  action: CallAction,
  failureCode?: string,
  options?: CallTransitionOptions,
): Promise<Call> {
  let existing = selectedCall;
  if (existing.status === 'RINGING' && isRingingCallExpired(existing.requestedAt)) {
    await expireCallIfNeeded(existing.id);
    const refreshedCall = await getSelectedCall(existing.id);
    if (!refreshedCall) throw new NotFoundError('The requested call does not exist.');
    existing = refreshedCall;
  }
  const current = CallStatusSchema.parse(existing.status);
  const target = transitionCallStatus(current, action);
  if (target === current) return mapCall(existing);

  const now = new Date();
  const updated = await getDatabaseClient().$transaction(async (transaction) => {
    const result = await transaction.call.updateMany({
      where: { id: existing.id, status: current as PrismaCallStatus },
      data: {
        ...(target === 'ACCEPTED' ? { respondedAt: now } : {}),
        ...(target === 'ACTIVE' ? { startedAt: now } : {}),
        ...(isTerminal(target) ? { endedAt: now } : {}),
        ...(failureCode && (target === 'FAILED' || target === 'MISSED') ? { failureCode } : {}),
        status: target as PrismaCallStatus,
      },
    });
    if (result.count === 0) throw new ConflictError('The call state changed. Please try again.');
    await transaction.callEvent.create({
      data: { callId: existing.id, payload: { from: current, to: target }, type: target },
    });
    return {
      ...existing,
      ...(failureCode && (target === 'FAILED' || target === 'MISSED') ? { failureCode } : {}),
      status: target as PrismaCallStatus,
    } satisfies SelectedCall;
  });
  const typedCall = mapCall(updated);
  if (options?.scheduleOperationalSync) {
    // Deliver the peer-visible state before returning. Cleanup and presence can
    // run after the response, but delaying ACCEPTED/ENDED makes calls feel slow.
    await notifyCallStatus(typedCall, updated.visitor.anonymousId);
    await runOrScheduleCallOperationalSync(existing.id, options.scheduleOperationalSync);
  } else {
    await Promise.all([
      target === 'CONNECTING' || target === 'ACTIVE'
        ? markAgentBusy(updated.agentId)
        : isTerminal(target)
          ? releaseAgentIfAvailable(updated.agentId)
          : Promise.resolve(),
      notifyCallStatus(typedCall, updated.visitor.anonymousId),
      isTerminal(target) && updated.roomName
        ? terminateLiveKitRoom(updated.roomName)
        : Promise.resolve(),
    ]);
  }
  return typedCall;
}

async function releaseAgentIfAvailable(agentId: string | null): Promise<void> {
  if (!agentId) return;
  const activeCalls = await getDatabaseClient().call.count({
    where: { agentId, status: { notIn: terminalStatuses } },
  });
  if (activeCalls === 0) await releaseAgent(agentId);
}

export async function reconcileStaleCallsForAgent(agentId: string): Promise<number> {
  const now = Date.now();
  const ringingCutoff = new Date(now - getRingTimeoutSeconds() * 1_000);
  const connectionCutoff = new Date(now - getConnectionTimeoutSeconds() * 1_000);
  const calls = await getDatabaseClient().call.findMany({
    where: {
      agentId,
      OR: [
        { requestedAt: { lte: ringingCutoff }, status: 'RINGING' },
        { requestedAt: { lte: connectionCutoff }, status: { in: ['ACCEPTED', 'CONNECTING'] } },
      ],
    },
    select: { id: true, status: true },
  });
  for (const call of calls) {
    const status = CallStatusSchema.parse(call.status);
    const action = staleCallAction(status);
    if (action) {
      await transitionCall(
        call.id,
        action,
        action === 'timeout' ? 'RING_TIMEOUT' : 'CONNECTION_TIMEOUT',
      );
    }
  }
  await releaseAgentIfAvailable(agentId);
  return calls.length;
}

export async function acceptVisitorCall(
  callId: string,
  origin: string,
  context: TrackingContext,
  options?: CallTransitionOptions,
): Promise<Call> {
  const [resolved, call] = await Promise.all([
    resolveTrackingContext(context, origin),
    getSelectedCall(callId),
  ]);
  if (!call || call.visitorId !== resolved.visitorId || call.sessionId !== resolved.sessionId) {
    throw new ForbiddenError('The requested call is not available to this visitor session.');
  }
  return transitionSelectedCall(call, 'accept', undefined, options);
}

export async function rejectVisitorCall(
  callId: string,
  origin: string,
  context: TrackingContext,
): Promise<Call> {
  const [resolved, call] = await Promise.all([
    resolveTrackingContext(context, origin),
    getSelectedCall(callId),
  ]);
  if (!call || call.visitorId !== resolved.visitorId || call.sessionId !== resolved.sessionId) {
    throw new ForbiddenError('The requested call is not available to this visitor session.');
  }
  return transitionSelectedCall(call, 'reject');
}

export async function endVisitorCall(
  callId: string,
  origin: string,
  context: TrackingContext,
  options?: CallTransitionOptions,
): Promise<Call> {
  const [resolved, call] = await Promise.all([
    resolveTrackingContext(context, origin),
    getSelectedCall(callId),
  ]);
  if (!call || call.visitorId !== resolved.visitorId || call.sessionId !== resolved.sessionId) {
    throw new ForbiddenError('The requested call is not available to this visitor session.');
  }
  return transitionSelectedCall(call, 'end', undefined, options);
}

export async function failVisitorCall(
  callId: string,
  origin: string,
  context: TrackingContext,
  failureCode: CallMediaFailureCode,
  options?: CallTransitionOptions,
): Promise<Call> {
  const [resolved, call] = await Promise.all([
    resolveTrackingContext(context, origin),
    getSelectedCall(callId),
  ]);
  if (!call || call.visitorId !== resolved.visitorId || call.sessionId !== resolved.sessionId) {
    throw new ForbiddenError('The requested call is not available to this visitor session.');
  }
  return transitionSelectedCall(call, 'fail', failureCode, options);
}
