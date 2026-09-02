import 'server-only';

import { AccessToken, type VideoGrant } from 'livekit-server-sdk';

import {
  CallStatusSchema,
  LiveKitTokenResponseSchema,
  type Call,
  type LiveKitParticipantRole,
  type LiveKitTokenResponse,
  type TrackingContext,
} from '@supernizo/shared';
import type { CallStatus as PrismaCallStatus } from '@generated/prisma/client';

import { getDatabaseClient } from '@/server/db/client';
import { ConflictError, ForbiddenError, NotFoundError } from '@/server/errors/app-error';
import { getLiveKitServerConfig, type LiveKitServerConfig } from '@/server/livekit/config';

import { acceptVisitorCall, transitionCall, type CallTransitionOptions } from './call-service';
import { resolveTrackingContext } from './tracker-engagement-service';

const MEDIA_TOKEN_TTL_SECONDS = 10 * 60;

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
  status: PrismaCallStatus;
  visitorId: string;
}>;

export function getLiveKitParticipantIdentity(
  role: LiveKitParticipantRole,
  participantId: string,
): string {
  return `${role === 'AGENT' ? 'agent' : 'visitor'}:${participantId}`;
}

export function canIssueLiveKitToken(status: string): boolean {
  return status === 'ACCEPTED' || status === 'CONNECTING' || status === 'ACTIVE';
}

export function haveExpectedLiveKitParticipantsJoined(
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

export async function createLiveKitParticipantToken(
  input: Readonly<{
    config?: LiveKitServerConfig;
    identity: string;
    roomName: string;
  }>,
): Promise<LiveKitTokenResponse> {
  const config = input.config ?? getLiveKitServerConfig();
  const grant: VideoGrant = {
    canPublish: true,
    canSubscribe: true,
    room: input.roomName,
    roomJoin: true,
  };
  const token = new AccessToken(config.apiKey, config.apiSecret, {
    identity: input.identity,
    ttl: MEDIA_TOKEN_TTL_SECONDS,
  });
  token.addGrant(grant);
  return LiveKitTokenResponseSchema.parse({ token: await token.toJwt(), url: config.url });
}

async function getTokenCall(callId: string): Promise<TokenCall> {
  const call = await getDatabaseClient().call.findUnique({
    where: { id: callId },
    select: {
      agentId: true,
      id: true,
      roomName: true,
      sessionId: true,
      status: true,
      visitorId: true,
    },
  });
  if (!call || !call.roomName) throw new NotFoundError('The requested call does not exist.');
  return call;
}

export async function issueAgentLiveKitToken(
  callId: string,
  userId: string,
): Promise<LiveKitTokenResponse> {
  const call = await getTokenCall(callId);
  if (call.agentId !== userId) {
    throw new ForbiddenError('The requested call is not assigned to this agent.');
  }
  if (!canIssueLiveKitToken(call.status)) {
    throw new ConflictError('The call has not been accepted or is no longer active.');
  }
  return createLiveKitParticipantToken({
    identity: getLiveKitParticipantIdentity('AGENT', userId),
    roomName: call.roomName!,
  });
}

export async function issueVisitorLiveKitToken(
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

export async function acceptVisitorCallWithMedia(
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

export async function handleLiveKitWebhookEvent(
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
  const database = getDatabaseClient();
  const call = await database.call.findUnique({
    where: { roomName: input.roomName },
    select: { agentId: true, id: true, status: true, visitorId: true },
  });
  if (!call) return;

  const priorLiveKitEvents = await database.callEvent.findMany({
    where: { callId: call.id, type: { startsWith: 'LIVEKIT_' } },
    select: { payload: true, type: true },
  });
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

  await database.callEvent.create({
    data: {
      callId: call.id,
      type: `LIVEKIT_${input.event.toUpperCase()}`,
      ...(Object.keys(payload).length > 0 ? { payload } : {}),
    },
  });

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
    const recordedJoinEvents = await database.callEvent.findMany({
      where: { callId: call.id, type: 'LIVEKIT_PARTICIPANT_JOINED' },
      select: { payload: true },
    });
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
        const refreshedCall = await database.call.findUnique({
          where: { id: call.id },
          select: { status: true },
        });
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
