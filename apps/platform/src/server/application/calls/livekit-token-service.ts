import type { LivekitTokenRepository } from '@/server/application/ports/livekit-token-repository';
import 'server-only';
import {
  CallStatusSchema,
  type CallStatus,
  type Call,
  type CallType,
  type LiveKitParticipantRole,
  type LiveKitTokenResponse,
  type TrackingContext,
} from '@supernizo/shared';
import { ConflictError, ForbiddenError, NotFoundError } from '@/server/domain/errors/app-error';
import type { CallTransitionOptions } from './call-service';
import type { RuntimeProviders } from '@/server/application/ports/runtime-providers';
import type { createCallService } from './call-service';
import type { createTrackerEngagementService } from '../tracking/tracker-engagement-service';
export const liveKitCallEventNames = [
  'participant_joined',
  'participant_left',
  'participant_connection_aborted',
  'room_finished',
  'track_published',
  'track_unpublished',
] as const;

export type LiveKitCallEventName = (typeof liveKitCallEventNames)[number];

type StoredLiveKitEventPayload = Readonly<{
  identity?: string;
  trackMuted?: boolean;
  trackName?: string;
  trackSid?: string;
  trackSource?: string;
  trackType?: string;
  webhookEventId?: string;
}>;

type TokenCall = Readonly<{
  agentId: string | null;
  id: string;
  roomName: string | null;
  sessionId: string | null;
  status: CallStatus;
  visitorId: string;
}>;
export function createLivekitTokenService(
  dependencies: Pick<
    RuntimeProviders,
    'getLiveKitServerConfig' | 'createLiveKitParticipantToken'
  > & {
    repository: LivekitTokenRepository;
    acceptVisitorCall: ReturnType<typeof createCallService>['acceptVisitorCall'];
    createCall: ReturnType<typeof createCallService>['createCall'];
    transitionCall: ReturnType<typeof createCallService>['transitionCall'];
    resolveTrackingContext: ReturnType<
      typeof createTrackerEngagementService
    >['resolveTrackingContext'];
  },
) {
  const {
    repository,
    getLiveKitServerConfig,
    createLiveKitParticipantToken,
    acceptVisitorCall,
    createCall,
    transitionCall,
    resolveTrackingContext,
  } = dependencies;
  function getLiveKitParticipantIdentity(
    role: LiveKitParticipantRole,
    participantId: string,
  ): string {
    return `${role === 'AGENT' ? 'agent' : 'visitor'}:${participantId}`;
  }

  function canIssueLiveKitToken(status: string): boolean {
    return status === 'ACCEPTED' || status === 'CONNECTING' || status === 'ACTIVE';
  }

  function canIssueAgentLiveKitToken(status: string): boolean {
    return status === 'RINGING' || canIssueLiveKitToken(status);
  }

  function haveExpectedLiveKitParticipantsJoined(
    expectedIdentities: readonly string[],
    joinedIdentities: readonly string[],
  ): boolean {
    const joined = new Set(joinedIdentities);
    return (
      expectedIdentities.length > 0 && expectedIdentities.every((identity) => joined.has(identity))
    );
  }

  function readStoredLiveKitEventPayload(payload: unknown): StoredLiveKitEventPayload {
    if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) return {};
    const candidate = payload as Record<string, unknown>;
    return {
      ...(typeof candidate.identity === 'string' ? { identity: candidate.identity } : {}),
      ...(typeof candidate.webhookEventId === 'string'
        ? { webhookEventId: candidate.webhookEventId }
        : {}),
    };
  }

  async function getTokenCall(callId: string): Promise<TokenCall> {
    const call = await repository.findTokenCall(callId);
    if (!call || !call.roomName) throw new NotFoundError('The requested call does not exist.');
    return call;
  }

  async function issueAgentLiveKitToken(
    callId: string,
    userId: string,
  ): Promise<LiveKitTokenResponse> {
    const call = await getTokenCall(callId);
    if (call.agentId !== userId) {
      throw new ForbiddenError('The requested call is not assigned to this agent.');
    }
    if (!canIssueAgentLiveKitToken(call.status)) {
      throw new ConflictError('The call has not been accepted or is no longer active.');
    }
    return createLiveKitParticipantToken({
      identity: getLiveKitParticipantIdentity('AGENT', userId),
      roomName: call.roomName!,
    });
  }

  async function issueVisitorLiveKitToken(
    callId: string,
    origin: string,
    context: TrackingContext,
  ): Promise<LiveKitTokenResponse> {
    const [call, resolved] = await Promise.all([
      getTokenCall(callId),
      resolveTrackingContext(context, origin),
    ]);
    if (call.visitorId !== resolved.visitorId || call.sessionId !== resolved.sessionId) {
      throw new ForbiddenError('The requested call is not available to this visitor session.');
    }
    if (!canIssueLiveKitToken(call.status)) {
      throw new ConflictError('The call has not been accepted or is no longer active.');
    }
    return createLiveKitParticipantToken({
      identity: getLiveKitParticipantIdentity('VISITOR', resolved.visitorId),
      roomName: call.roomName!,
    });
  }

  async function acceptVisitorCallWithMedia(
    callId: string,
    origin: string,
    context: TrackingContext,
    options?: CallTransitionOptions,
  ): Promise<Readonly<{ call: Call; media: LiveKitTokenResponse }>> {
    const call = await acceptVisitorCall(callId, origin, context, options);
    const media = await createLiveKitParticipantToken({
      identity: getLiveKitParticipantIdentity('VISITOR', call.visitorId),
      roomName: call.roomName,
    });
    return { call, media };
  }

  async function createCallWithAgentMedia(
    input: Readonly<{
      agentId: string;
      siteId: string;
      type: CallType;
      visitorId: string;
    }>,
    options?: CallTransitionOptions,
  ): Promise<Readonly<{ call: Call; media: LiveKitTokenResponse }>> {
    // Validate configuration before creating a durable call so a missing LiveKit
    // secret cannot leave a call ringing without usable media credentials.
    const config = getLiveKitServerConfig();
    const call = await createCall(input, options);
    const media = await createLiveKitParticipantToken({
      config,
      identity: getLiveKitParticipantIdentity('AGENT', input.agentId),
      roomName: call.roomName,
    });
    return { call, media };
  }

  async function handleLiveKitWebhookEvent(
    input: Readonly<{
      event: LiveKitCallEventName;
      participantIdentity?: string | undefined;
      roomName: string;
      trackMuted?: boolean | undefined;
      trackName?: string | undefined;
      trackSid?: string | undefined;
      trackSource?: string | undefined;
      trackType?: string | undefined;
      webhookEventId?: string | undefined;
    }>,
    options?: CallTransitionOptions,
  ): Promise<void> {
    const call = await repository.findRoomCall(input);
    if (!call) return;

    const priorLiveKitEvents = await repository.listMediaEvents(call);
    if (
      input.webhookEventId &&
      priorLiveKitEvents.some(
        ({ payload }) =>
          readStoredLiveKitEventPayload(payload).webhookEventId === input.webhookEventId,
      )
    ) {
      return;
    }

    const payload: StoredLiveKitEventPayload = {
      ...(input.participantIdentity ? { identity: input.participantIdentity } : {}),
      ...(input.trackMuted !== undefined ? { trackMuted: input.trackMuted } : {}),
      ...(input.trackName ? { trackName: input.trackName } : {}),
      ...(input.trackSid ? { trackSid: input.trackSid } : {}),
      ...(input.trackSource ? { trackSource: input.trackSource } : {}),
      ...(input.trackType ? { trackType: input.trackType } : {}),
      ...(input.webhookEventId ? { webhookEventId: input.webhookEventId } : {}),
    };

    await repository.recordMediaEvent(call, input, payload);

    const status = CallStatusSchema.parse(call.status);
    const expectedParticipantIdentities = call.agentId
      ? [
          getLiveKitParticipantIdentity('AGENT', call.agentId),
          getLiveKitParticipantIdentity('VISITOR', call.visitorId),
        ]
      : [];
    const isExpectedParticipant =
      input.participantIdentity === undefined ||
      expectedParticipantIdentities.includes(input.participantIdentity);
    if (
      input.event === 'participant_joined' &&
      (status === 'ACCEPTED' || status === 'CONNECTING') &&
      call.agentId
    ) {
      // Read after inserting so concurrent agent/visitor join webhooks cannot both
      // miss the other participant and leave the durable call stuck CONNECTING.
      const recordedJoinEvents = await repository.listJoinEvents(call);
      const joinedIdentities = recordedJoinEvents
        .map(({ payload }) => readStoredLiveKitEventPayload(payload).identity)
        .filter((identity): identity is string => Boolean(identity));
      const bothParticipantsJoined = haveExpectedLiveKitParticipantsJoined(
        expectedParticipantIdentities,
        joinedIdentities,
      );
      if (bothParticipantsJoined) {
        try {
          if (status === 'ACCEPTED') {
            await transitionCall(call.id, 'connect', undefined, options);
          }
          await transitionCall(call.id, 'activate', undefined, options);
        } catch (error: unknown) {
          const refreshedCall = await repository.getCallStatus(call);
          if (refreshedCall?.status !== 'ACTIVE') throw error;
        }
      }
    }
    if (
      input.event === 'participant_left' &&
      isExpectedParticipant &&
      (status === 'ACTIVE' || status === 'CONNECTING' || status === 'ACCEPTED')
    ) {
      await transitionCall(
        call.id,
        status === 'ACTIVE' ? 'end' : 'fail',
        status === 'ACTIVE' ? undefined : 'MEDIA_PARTICIPANT_LEFT',
        options,
      );
    }
    if (
      input.event === 'room_finished' &&
      (status === 'ACTIVE' || status === 'CONNECTING' || status === 'ACCEPTED')
    ) {
      await transitionCall(
        call.id,
        status === 'ACTIVE' ? 'end' : 'fail',
        status === 'ACTIVE' ? undefined : 'MEDIA_ROOM_FINISHED',
        options,
      );
    }
    if (
      input.event === 'participant_connection_aborted' &&
      isExpectedParticipant &&
      (status === 'ACTIVE' || status === 'CONNECTING' || status === 'ACCEPTED')
    ) {
      await transitionCall(call.id, 'fail', 'MEDIA_CONNECTION_ABORTED', options);
    }
  }
  return {
    getLiveKitParticipantIdentity,
    canIssueLiveKitToken,
    canIssueAgentLiveKitToken,
    haveExpectedLiveKitParticipantsJoined,
    issueAgentLiveKitToken,
    issueVisitorLiveKitToken,
    acceptVisitorCallWithMedia,
    createCallWithAgentMedia,
    handleLiveKitWebhookEvent,
    createLiveKitParticipantToken,
  };
}
