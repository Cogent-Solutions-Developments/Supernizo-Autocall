import 'server-only';
import { createLivekitTokenService } from '@/server/application/calls/livekit-token-service';
import { runtimeProviders } from '@/server/composition/runtime-providers';
import { createLivekitTokenRepository } from '@/server/infrastructure/repositories/livekit-token-repository';
import { acceptVisitorCall } from '@/server/composition/calls/call-service';
import { createCall } from '@/server/composition/calls/call-service';
import { transitionCall } from '@/server/composition/calls/call-service';
import { resolveTrackingContext } from '@/server/composition/tracking/tracker-engagement-service';
export * from '@/server/application/calls/livekit-token-service';
const service = createLivekitTokenService({
  ...runtimeProviders,
  repository: createLivekitTokenRepository(),
  acceptVisitorCall: (...args) => acceptVisitorCall(...args),
  createCall: (...args) => createCall(...args),
  transitionCall: (...args) => transitionCall(...args),
  resolveTrackingContext: (...args) => resolveTrackingContext(...args),
});
export const {
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
} = service;
