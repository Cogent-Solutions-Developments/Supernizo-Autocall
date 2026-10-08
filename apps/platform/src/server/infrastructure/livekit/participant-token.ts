import 'server-only';
import { AccessToken, type VideoGrant } from 'livekit-server-sdk';
import { LiveKitTokenResponseSchema, type LiveKitTokenResponse } from '@supernizo/shared';
import { getLiveKitServerConfig, type LiveKitServerConfig } from './config';
const MEDIA_TOKEN_TTL_SECONDS = 10 * 60;
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
