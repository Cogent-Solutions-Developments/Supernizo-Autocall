import 'server-only';

import { randomUUID } from 'node:crypto';

import {
  CallSchema,
  CallStatusSchema,
  type Call,
  type CallStatus,
  type CallType,
  type TrackingContext,
} from '@supernizo/shared';
import type { CallStatus as PrismaCallStatus, Prisma } from '@generated/prisma/client';

import { getDatabaseClient } from '@/server/db/client';
import { ConflictError, ForbiddenError, NotFoundError } from '@/server/errors/app-error';
import { getEnvironmentReadiness } from '@/server/env';
import { getPresenceRepository } from '@/server/presence/presence-repository';
import { UpstashRealtimeProvider } from '@/server/realtime';

import { assertAgentCanStartCall, markAgentBusy, releaseAgent } from './agent-presence-service';
import { resolveTrackingContext } from './tracker-engagement-service';

const terminalStatuses: CallStatus[] = ['REJECTED', 'ENDED', 'MISSED', 'FAILED', 'CANCELLED'];

export type CallAction =
  'accept' | 'activate' | 'cancel' | 'connect' | 'end' | 'fail' | 'reject' | 'timeout';

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
  site: { select: { widgetAvatarUrl: true } },
  siteId: true,
  status: true,
  type: true,
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
  return status === 'ACCEPTED' || status === 'CONNECTING' || status === 'ACTIVE' ? 'fail' : null;
}

function roomName(): string {
  return `call_${randomUUID().replaceAll('-', '')}`;
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

async function emitCallStatus(call: Call): Promise<void> {
  await Promise.all([
    emitCall(`call:${call.id}`, 'call.status', call),
    getDatabaseClient()
      .visitor.findUnique({ where: { id: call.visitorId }, select: { anonymousId: true } })
      .then((visitor) =>
        visitor
          ? emitCall(`visitor:${call.siteId}:${visitor.anonymousId}`, 'call.status', call)
          : undefined,
      ),
  ]);
}

async function getSelectedCall(callId: string): Promise<SelectedCall | null> {
  return getDatabaseClient().call.findUnique({ where: { id: callId }, select: callSelect });
}

async function getMappedCall(callId: string): Promise<Call | null> {
  const call = await getSelectedCall(callId);
  return call ? mapCall(call) : null;
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
  await releaseAgentIfAvailable(updated.agentId);
  await emitCallStatus(typedCall);
  return typedCall;
}

export async function createCall(
  input: Readonly<{
    agentId: string;
    siteId: string;
    type: CallType;
    visitorId: string;
  }>,
): Promise<Call> {
  await assertAgentCanStartCall(input.agentId);
  await assertCallEnabled(input.siteId, input.type);
  const presence = await getPresenceRepository().get(input.siteId, input.visitorId);
  if (!presence) throw new ConflictError('The visitor is no longer online.');

  const database = getDatabaseClient();
  const { call, expiredCalls } = await database.$transaction(async (transaction) => {
    await transaction.$queryRaw`SELECT id FROM \`User\` WHERE id = ${input.agentId} FOR UPDATE`;
    await transaction.$queryRaw`SELECT id FROM \`Visitor\` WHERE id = ${input.visitorId} FOR UPDATE`;
    const expiredCalls = await expireStalePendingCalls(transaction, input.visitorId, input.agentId);
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
    return { call, expiredCalls };
  });

  await Promise.all(
    expiredCalls.map(async (expiredCall) => {
      await releaseAgentIfAvailable(expiredCall.agentId);
      await emitCallStatus(mapCall(expiredCall));
    }),
  );

  const typedCall = mapCall(call);
  await markAgentBusy(call.agentId);
  const visitor = await database.visitor.findUnique({
    where: { id: typedCall.visitorId },
    select: { anonymousId: true },
  });
  if (visitor)
    await emitCall(
      `visitor:${typedCall.siteId}:${visitor.anonymousId}`,
      'call.incoming',
      typedCall,
    );
  await emitCall(`call:${typedCall.id}`, 'call.status', typedCall);
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
): Promise<Call> {
  await expireCallIfNeeded(callId);
  const existing = await getSelectedCall(callId);
  if (!existing) throw new NotFoundError('The requested call does not exist.');
  const current = CallStatusSchema.parse(existing.status);
  const target = transitionCallStatus(current, action);
  if (target === current) return mapCall(existing);

  const now = new Date();
  const updated = await getDatabaseClient().$transaction(async (transaction) => {
    const result = await transaction.call.updateMany({
      where: { id: callId, status: current as PrismaCallStatus },
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
      data: { callId, payload: { from: current, to: target }, type: target },
    });
    return transaction.call.findUnique({ where: { id: callId }, select: callSelect });
  });
  if (!updated) throw new NotFoundError('The requested call does not exist.');
  const typedCall = mapCall(updated);
  if (target === 'CONNECTING' || target === 'ACTIVE') await markAgentBusy(updated.agentId);
  if (isTerminal(target)) await releaseAgentIfAvailable(updated.agentId);
  await emitCallStatus(typedCall);
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
        { startedAt: { lte: connectionCutoff }, status: 'ACTIVE' },
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
): Promise<Call> {
  const resolved = await resolveTrackingContext(context, origin);
  const call = await getSelectedCall(callId);
  if (!call || call.visitorId !== resolved.visitorId) {
    throw new ForbiddenError('The requested call is not available to this visitor.');
  }
  const fullCall = await getDatabaseClient().call.findUnique({
    where: { id: callId },
    select: { sessionId: true },
  });
  if (!fullCall || fullCall.sessionId !== resolved.sessionId) {
    throw new ForbiddenError('The requested call is not available to this session.');
  }
  return transitionCall(callId, 'accept');
}

export async function rejectVisitorCall(
  callId: string,
  origin: string,
  context: TrackingContext,
): Promise<Call> {
  const resolved = await resolveTrackingContext(context, origin);
  const [call, fullCall] = await Promise.all([
    getSelectedCall(callId),
    getDatabaseClient().call.findUnique({ where: { id: callId }, select: { sessionId: true } }),
  ]);
  if (!call || call.visitorId !== resolved.visitorId) {
    throw new ForbiddenError('The requested call is not available to this visitor.');
  }
  if (!fullCall || fullCall.sessionId !== resolved.sessionId) {
    throw new ForbiddenError('The requested call is not available to this session.');
  }
  return transitionCall(callId, 'reject');
}

export async function endVisitorCall(
  callId: string,
  origin: string,
  context: TrackingContext,
): Promise<Call> {
  const resolved = await resolveTrackingContext(context, origin);
  const call = await getDatabaseClient().call.findUnique({
    where: { id: callId },
    select: { sessionId: true, visitorId: true },
  });
  if (!call || call.visitorId !== resolved.visitorId || call.sessionId !== resolved.sessionId) {
    throw new ForbiddenError('The requested call is not available to this visitor session.');
  }
  return transitionCall(callId, 'end');
}
