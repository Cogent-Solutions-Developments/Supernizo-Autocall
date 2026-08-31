import 'server-only';

import { AccessToken, type VideoGrant } from 'livekit-server-sdk';

import {
  CallStatusSchema,
  LiveKitTokenResponseSchema,
  type LiveKitParticipantRole,
  type LiveKitTokenResponse,
  type TrackingContext,
} from '@supernizo/shared';
import type { CallStatus as PrismaCallStatus } from '@generated/prisma/client';

import { getDatabaseClient } from '@/server/db/client';
import { ConflictError, ForbiddenError, NotFoundError } from '@/server/errors/app-error';
import { getLiveKitServerConfig, type LiveKitServerConfig } from '@/server/livekit/config';

import { transitionCall } from './call-service';
import { resolveTrackingContext } from './tracker-engagement-service';

const MEDIA_TOKEN_TTL_SECONDS = 10 * 60;

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

async function moveAcceptedCallToConnecting(call: TokenCall): Promise<TokenCall> {
  if (call.status !== 'ACCEPTED') return call;
  try {
    await transitionCall(call.id, 'connect');
  } catch (error: unknown) {
    const refreshedCall = await getTokenCall(call.id);
    if (refreshedCall.status !== 'CONNECTING' && refreshedCall.status !== 'ACTIVE') throw error;
  }
  return getTokenCall(call.id);
}

export async function issueAgentLiveKitToken(
  callId: string,
  userId: string,
): Promise<LiveKitTokenResponse> {
  const call = await getTokenCall(callId);
  if (call.agentId !== userId) {
    throw new ForbiddenError('The requested call is not assigned to this agent.');
  }
  const eligibleCall = await moveAcceptedCallToConnecting(call);
  if (!canIssueLiveKitToken(eligibleCall.status)) {
    throw new ConflictError('The call has not been accepted or is no longer active.');
  }
  return createLiveKitParticipantToken({
    identity: getLiveKitParticipantIdentity('AGENT', userId),
    roomName: eligibleCall.roomName!,
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
  const eligibleCall = await moveAcceptedCallToConnecting(call);
  if (!canIssueLiveKitToken(eligibleCall.status)) {
    throw new ConflictError('The call has not been accepted or is no longer active.');
  }
  return createLiveKitParticipantToken({
    identity: getLiveKitParticipantIdentity('VISITOR', resolved.visitorId),
    roomName: eligibleCall.roomName!,
  });
}

export async function handleLiveKitWebhookEvent(
  input: Readonly<{
    event: 'participant_joined' | 'participant_left' | 'room_finished';
    participantIdentity?: string;
    roomName: string;
  }>,
): Promise<void> {
  const call = await getDatabaseClient().call.findUnique({
    where: { roomName: input.roomName },
    select: { id: true, status: true },
  });
  if (!call) return;

  await getDatabaseClient().callEvent.create({
    data: {
      callId: call.id,
      type: `LIVEKIT_${input.event.toUpperCase()}`,
      ...(input.participantIdentity ? { payload: { identity: input.participantIdentity } } : {}),
    },
  });

  const status = CallStatusSchema.parse(call.status);
  if (input.event === 'participant_joined' && status === 'CONNECTING') {
    await transitionCall(call.id, 'activate');
  }
  if (
    (input.event === 'participant_left' || input.event === 'room_finished') &&
    (status === 'ACTIVE' || status === 'CONNECTING' || status === 'ACCEPTED')
  ) {
    await transitionCall(call.id, 'end');
  }
}
