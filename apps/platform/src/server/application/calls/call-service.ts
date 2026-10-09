import type {
  CallRepository,
  CallRepositorySession,
} from '@/server/application/ports/call-repository';
import 'server-only';
import { randomUUID } from 'node:crypto';
import {
  getAgentIdentity,
  CallSchema,
  CallStatusSchema,
  type Call,
  type CallMediaFailureCode,
  type CallStatus,
  type CallType,
  type IncomingCallSummary,
  type TrackingContext,
} from '@supernizo/shared';
import { ConflictError, ForbiddenError, NotFoundError } from '@/server/domain/errors/app-error';
import type { RuntimeProviders } from '@/server/application/ports/runtime-providers';
import type { createAgentPresenceService } from '../presence/agent-presence-service';
import type { createNotificationService } from '../notifications/notification-service';
import type { createTrackerEngagementService } from '../tracking/tracker-engagement-service';
export type CallAction =
  'accept' | 'activate' | 'cancel' | 'connect' | 'end' | 'fail' | 'reject' | 'timeout';

export type CallTransitionOptions = Readonly<{
  scheduleOperationalSync?: ((task: () => Promise<void>) => void) | undefined;
}>;

type SelectedCall = NonNullable<Awaited<ReturnType<CallRepository['findCall']>>>;

type CreatedCallOperationalInput = Readonly<{
  agentId: string | null;
  call: Call;
  expiredCalls: readonly Readonly<{ agentId: string | null; call: Call }>[];
}>;
export function createCallService(
  dependencies: Pick<
    RuntimeProviders,
    | 'getEnvironmentReadiness'
    | 'terminateLiveKitRoom'
    | 'logger'
    | 'getPresenceRepository'
    | 'getRealtimeProvider'
    | 'notifySupernizoCallResolution'
    | 'getCallTimingSource'
  > & {
    repository: CallRepository;
    assertAgentCanStartCall: ReturnType<
      typeof createAgentPresenceService
    >['assertAgentCanStartCall'];
    markAgentBusy: ReturnType<typeof createAgentPresenceService>['markAgentBusy'];
    releaseAgent: ReturnType<typeof createAgentPresenceService>['releaseAgent'];
    createIncomingCallNotification: ReturnType<
      typeof createNotificationService
    >['createIncomingCallNotification'];
    resolveTrackingContext: ReturnType<
      typeof createTrackerEngagementService
    >['resolveTrackingContext'];
  },
) {
  const {
    repository,
    getEnvironmentReadiness,
    terminateLiveKitRoom,
    logger,
    getPresenceRepository,
    getRealtimeProvider,
    notifySupernizoCallResolution,
    getCallTimingSource,
    assertAgentCanStartCall,
    markAgentBusy,
    releaseAgent,
    createIncomingCallNotification,
    resolveTrackingContext,
  } = dependencies;
  const terminalStatuses: CallStatus[] = ['REJECTED', 'ENDED', 'MISSED', 'FAILED', 'CANCELLED'];

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

  function mapCall(call: SelectedCall): Call {
    const agent = getAgentIdentity(call.agent);
    return CallSchema.parse({
      agentAvatarUrl: agent?.imageUrl ?? null,
      agentDisplayName: agent?.displayName ?? null,
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

  function getRingTimeoutSeconds(
    source: Readonly<Record<string, string | undefined>> = getCallTimingSource(),
  ): number {
    const parsed = Number.parseInt(source.CALL_RING_TIMEOUT_SECONDS ?? '30', 10);
    return Number.isInteger(parsed) && parsed >= 10 && parsed <= 120 ? parsed : 30;
  }

  function getConnectionTimeoutSeconds(
    source: Readonly<Record<string, string | undefined>> = getCallTimingSource(),
  ): number {
    const parsed = Number.parseInt(source.CALL_CONNECTION_TIMEOUT_SECONDS ?? '90', 10);
    return Number.isInteger(parsed) && parsed >= 30 && parsed <= 300 ? parsed : 90;
  }

  function isRingingCallExpired(
    requestedAt: Date,
    now = Date.now(),
    timeoutSeconds = getRingTimeoutSeconds(),
  ): boolean {
    return requestedAt.getTime() + timeoutSeconds * 1_000 <= now;
  }

  function transitionCallStatus(current: CallStatus, action: CallAction): CallStatus {
    const target = transitionTargets[action];
    if (current === target) return current;
    if (!allowedTransitions[current].includes(action)) {
      throw new ConflictError(`A call in ${current} state cannot be ${action}ed.`);
    }
    return target;
  }

  function staleCallAction(status: CallStatus): CallAction | null {
    if (status === 'RINGING') return 'timeout';
    return status === 'ACCEPTED' || status === 'CONNECTING' ? 'fail' : null;
  }

  function visitorTerminationAction(status: CallStatus): 'cancel' | 'end' | null {
    if (status === 'RINGING') return 'cancel';
    if (status === 'ACCEPTED' || status === 'CONNECTING' || status === 'ACTIVE') return 'end';
    return null;
  }

  function roomName(): string {
    return `call_${randomUUID().replaceAll('-', '')}`;
  }

  function visitorLocationLabel(
    input: Readonly<{ geoCity?: string | null; geoCountry?: string | null }>,
  ): string {
    return (
      [input.geoCity, input.geoCountry]
        .map((value) => value?.trim())
        .filter((value): value is string => Boolean(value))
        .join(', ') || 'Location unavailable'
    );
  }

  async function assertCallEnabled(siteId: string, type: CallType): Promise<void> {
    const site = await repository.getSiteCallSettings(siteId);
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
    await getRealtimeProvider().emitToChannel(channel, { type, call });
  }

  async function emitCallStatus(call: Call, visitorAnonymousId?: string): Promise<void> {
    const anonymousId =
      visitorAnonymousId ?? (await repository.getVisitorIdentity(call))?.anonymousId;
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

  async function notifySupernizoCallResolutionSafely(call: Call): Promise<void> {
    try {
      await notifySupernizoCallResolution(call);
    } catch (error: unknown) {
      logger.log('error', 'supernizo_call_resolution_delivery_failed', {
        callId: call.id,
        status: call.status,
        error: error instanceof Error ? error.message : 'unknown_error',
      });
    }
  }

  async function getSelectedCall(callId: string): Promise<SelectedCall | null> {
    return repository.findCall(callId);
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

  async function runOrScheduleCallOperationalSync(
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

  async function runOrScheduleCreatedCallOperationalSync(
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
    transaction: CallRepositorySession,
    visitorId: string,
    agentId?: string,
  ): Promise<SelectedCall[]> {
    const ringingCutoff = new Date(Date.now() - getRingTimeoutSeconds() * 1_000);
    const connectionCutoff = new Date(Date.now() - getConnectionTimeoutSeconds() * 1_000);
    const staleCalls = await transaction.findStaleCalls(
      visitorId,
      agentId,
      ringingCutoff,
      connectionCutoff,
    );
    if (staleCalls.length === 0) return [];

    const expiredCalls: Array<Readonly<{ id: string; status: 'FAILED' | 'MISSED' }>> = [];
    for (const staleCall of staleCalls) {
      const terminalStatus = staleCall.status === 'RINGING' ? 'MISSED' : 'FAILED';
      const result = await transaction.expirePendingCall(staleCall, terminalStatus);
      if (result.count === 1) expiredCalls.push({ id: staleCall.id, status: terminalStatus });
    }
    if (expiredCalls.length === 0) return [];

    await transaction.recordExpiredCalls(expiredCalls);
    return transaction.listCallsByIds(expiredCalls);
  }

  async function expireCallIfNeeded(callId: string): Promise<Call | null> {
    const call = await repository.getCallExpiry(callId);
    if (!call) return null;
    if (call.status !== 'RINGING') return getMappedCall(callId);
    if (!isRingingCallExpired(call.requestedAt)) {
      return getMappedCall(callId);
    }

    const updated = await repository.transaction(async (transaction) => {
      const result = await transaction.expireRingingCall(callId);
      if (result.count === 0) return null;
      await transaction.recordMissedCall(callId);
      return transaction.findExpiredCall(callId);
    });
    if (!updated) return getMappedCall(callId);
    const typedCall = mapCall(updated);
    await Promise.all([
      releaseAgentIfAvailable(updated.agentId),
      notifyCallStatus(typedCall, updated.visitor.anonymousId),
    ]);
    return typedCall;
  }

  async function createCall(
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

    const { call, expiredCalls, visitorAnonymousId } = await repository.transaction(
      async (transaction) => {
        await transaction.lockParticipants(input.agentId, input.visitorId);
        const expiredCalls = await expireStalePendingCalls(
          transaction,
          input.visitorId,
          input.agentId,
        );
        const [visitor, existingVisitorCall, existingAgentCall, session] = await Promise.all([
          transaction.findScopedVisitor(input),
          transaction.findVisitorActiveCall(terminalStatuses, input),
          transaction.findAgentActiveCall(input, terminalStatuses),
          transaction.findPresenceSession(presence),
        ]);
        if (!visitor || !session || session.visitorId !== visitor.id) {
          throw new ConflictError('The visitor presence record is no longer valid.');
        }
        if (existingVisitorCall)
          throw new ConflictError('This visitor already has an active call.');
        if (existingAgentCall) throw new ConflictError('The agent is busy with another call.');

        const call = await transaction.createAgentCall(input, roomName, session);
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

  async function requestVisitorCall(
    origin: string,
    context: TrackingContext,
    type: CallType,
    options?: CallTransitionOptions,
  ): Promise<Call> {
    const resolved = await resolveTrackingContext(context, origin);
    await assertCallEnabled(resolved.siteId, type);
    const visitorPresence = await getPresenceRepository().get(resolved.siteId, resolved.visitorId);
    if (!visitorPresence || visitorPresence.sessionId !== context.sessionId) {
      throw new ConflictError('Keep this page open to request a call.');
    }

    const possibleAgents = await repository.listEligibleAgents();
    if (possibleAgents.length === 0) {
      throw new ConflictError('No event agent is available right now. Please try again shortly.');
    }

    const created = await repository.transaction(async (transaction) => {
      await transaction.lockVisitor(resolved.visitorId);
      const expiredCalls = await expireStalePendingCalls(transaction, resolved.visitorId);
      const [visitor, session, existingVisitorCall, site] = await Promise.all([
        transaction.findRequestingVisitor(resolved),
        transaction.findRequestingSession(resolved),
        transaction.findPendingVisitorCall(terminalStatuses, resolved),
        transaction.getRequestSite(resolved),
      ]);
      if (!visitor || !session || session.visitorId !== visitor.id || !site) {
        throw new ConflictError('The visitor session is no longer available.');
      }
      if (existingVisitorCall) throw new ConflictError('This visitor already has an active call.');

      const call = await transaction.createVisitorCall(roomName, session, resolved, type, visitor);
      return {
        call,
        expiredCalls,
        siteName: site.name,
        visitorAnonymousId: visitor.anonymousId,
        visitorLocation: visitorLocationLabel(session),
      };
    });

    const typedCall = mapCall(created.call);
    await runOrScheduleCreatedCallOperationalSync(
      {
        agentId: null,
        call: typedCall,
        expiredCalls: created.expiredCalls.map((expiredCall) => ({
          agentId: expiredCall.agentId,
          call: mapCall(expiredCall),
        })),
      },
      options?.scheduleOperationalSync,
    );
    await emitCall(
      `visitor:${typedCall.siteId}:${created.visitorAnonymousId}`,
      'call.incoming',
      typedCall,
    );
    const notifications = await Promise.allSettled(
      possibleAgents.map(({ id }) =>
        createIncomingCallNotification({
          callId: typedCall.id,
          recipientUserId: id,
          siteId: typedCall.siteId,
          siteName: created.siteName,
          type,
          visitorId: typedCall.visitorId,
          visitorLabel: created.visitorLocation,
        }),
      ),
    );
    if (notifications.some((result) => result.status === 'rejected')) {
      logger.log('error', 'incoming_call_notification_failed', { callId: typedCall.id });
    }
    return typedCall;
  }

  async function getCall(callId: string): Promise<Call | null> {
    return expireCallIfNeeded(callId);
  }

  async function listIncomingCallsForAgent(): Promise<IncomingCallSummary[]> {
    const calls = await repository.listIncomingCalls();
    const resolved = await Promise.all(
      calls.map(async (call): Promise<IncomingCallSummary | null> => {
        const activeCall = await expireCallIfNeeded(call.id);
        if (activeCall?.status !== 'RINGING') return null;

        return {
          call: activeCall,
          eventName: call.site.name,
          visitorLocation: visitorLocationLabel(call.session ?? {}),
        };
      }),
    );
    return resolved.filter((call): call is IncomingCallSummary => call !== null);
  }

  async function getCallScope(
    callId: string,
  ): Promise<Readonly<{ agentId: string | null; siteId: string }> | null> {
    return repository.getScope(callId);
  }

  async function transitionCall(
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
    const updated = await repository.transaction(async (transaction) => {
      const result = await transaction.compareAndSetStatus(
        existing,
        current,
        target,
        now,
        isTerminal,
        failureCode,
      );
      if (result.count === 0) throw new ConflictError('The call state changed. Please try again.');
      await transaction.recordTransition(existing, current, target);
      return {
        ...existing,
        ...(failureCode && (target === 'FAILED' || target === 'MISSED') ? { failureCode } : {}),
        status: target,
      } satisfies SelectedCall;
    });
    const typedCall = mapCall(updated);
    if (options?.scheduleOperationalSync) {
      // Deliver the peer-visible state before returning. Cleanup and presence can
      // run after the response, but delaying ACCEPTED/ENDED makes calls feel slow.
      await Promise.all([
        notifyCallStatus(typedCall, updated.visitor.anonymousId),
        notifySupernizoCallResolutionSafely(typedCall),
      ]);
      await runOrScheduleCallOperationalSync(existing.id, options.scheduleOperationalSync);
    } else {
      await Promise.all([
        target === 'CONNECTING' || target === 'ACTIVE'
          ? markAgentBusy(updated.agentId)
          : isTerminal(target)
            ? releaseAgentIfAvailable(updated.agentId)
            : Promise.resolve(),
        notifyCallStatus(typedCall, updated.visitor.anonymousId),
        notifySupernizoCallResolutionSafely(typedCall),
        isTerminal(target) && updated.roomName
          ? terminateLiveKitRoom(updated.roomName)
          : Promise.resolve(),
      ]);
    }
    return typedCall;
  }

  async function releaseAgentIfAvailable(agentId: string | null): Promise<void> {
    if (!agentId) return;
    const activeCalls = await repository.countAgentActiveCalls(agentId, terminalStatuses);
    if (activeCalls === 0) await releaseAgent(agentId);
  }

  async function reconcileStaleCallsForAgent(agentId: string): Promise<number> {
    const now = Date.now();
    const ringingCutoff = new Date(now - getRingTimeoutSeconds() * 1_000);
    const connectionCutoff = new Date(now - getConnectionTimeoutSeconds() * 1_000);
    const calls = await repository.findAgentStaleCalls(agentId, ringingCutoff, connectionCutoff);
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

  async function acceptVisitorCall(
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

  async function claimIncomingCall(callId: string, agentId: string): Promise<Call> {
    const existing = await getSelectedCall(callId);
    if (!existing || !existing.visitorInitiated || existing.status !== 'RINGING') {
      throw new ConflictError('This call is no longer available.');
    }

    const updated = await repository.transaction(async (transaction) => {
      await transaction.lockParticipants(agentId, existing.visitorId);
      const activeAgentCall = await transaction.findClaimingAgentCall(agentId, terminalStatuses);
      if (activeAgentCall) throw new ConflictError('You are busy with another call.');
      const result = await transaction.claimIncomingCall(callId, agentId);
      if (result.count === 0) throw new ConflictError('Another agent accepted this call.');
      await transaction.recordClaim(callId);
      return transaction.getClaimedCall(callId);
    });
    const call = mapCall(updated);
    await Promise.all([
      markAgentBusy(agentId),
      notifyCallStatus(call, updated.visitor.anonymousId),
      notifySupernizoCallResolutionSafely(call),
    ]);
    return call;
  }

  async function rejectVisitorCall(
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

  async function endVisitorCall(
    callId: string,
    origin: string,
    context: TrackingContext,
    options?: CallTransitionOptions,
  ): Promise<Call> {
    const resolved = await resolveTrackingContext(context, origin);

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const call = await getSelectedCall(callId);
      if (!call || call.visitorId !== resolved.visitorId || call.sessionId !== resolved.sessionId) {
        throw new ForbiddenError('The requested call is not available to this visitor session.');
      }

      const action = visitorTerminationAction(CallStatusSchema.parse(call.status));
      if (!action) return mapCall(call);

      try {
        return await transitionSelectedCall(call, action, undefined, options);
      } catch (error: unknown) {
        // If an agent accepted at the same instant, reload the call and end that
        // newly accepted call instead of leaving the agent in an empty room.
        if (error instanceof ConflictError && attempt === 0) continue;
        throw error;
      }
    }

    throw new ConflictError('The call state changed. Please try again.');
  }

  async function failVisitorCall(
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
  return {
    getRingTimeoutSeconds,
    getConnectionTimeoutSeconds,
    isRingingCallExpired,
    transitionCallStatus,
    staleCallAction,
    visitorTerminationAction,
    visitorLocationLabel,
    runOrScheduleCallOperationalSync,
    runOrScheduleCreatedCallOperationalSync,
    createCall,
    requestVisitorCall,
    getCall,
    listIncomingCallsForAgent,
    getCallScope,
    transitionCall,
    reconcileStaleCallsForAgent,
    acceptVisitorCall,
    claimIncomingCall,
    rejectVisitorCall,
    endVisitorCall,
    failVisitorCall,
  };
}
