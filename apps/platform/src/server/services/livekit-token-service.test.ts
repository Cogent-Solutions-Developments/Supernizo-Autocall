import { describe, expect, it } from 'vitest';

import {
  canIssueLiveKitToken,
  createLiveKitParticipantToken,
  getLiveKitParticipantIdentity,
} from './livekit-token-service';

describe('LiveKit token authorization helpers', () => {
  it('creates role-bound participant identities', () => {
    expect(getLiveKitParticipantIdentity('AGENT', 'user_123')).toBe('agent:user_123');
    expect(getLiveKitParticipantIdentity('VISITOR', 'visitor_123')).toBe('visitor:visitor_123');
  });

  it('only permits media tokens after acceptance', () => {
    expect(canIssueLiveKitToken('RINGING')).toBe(false);
    expect(canIssueLiveKitToken('ACCEPTED')).toBe(true);
    expect(canIssueLiveKitToken('CONNECTING')).toBe(true);
    expect(canIssueLiveKitToken('ACTIVE')).toBe(true);
    expect(canIssueLiveKitToken('ENDED')).toBe(false);
  });

  it('issues a short-lived token bound to exactly one generated room', async () => {
    const result = await createLiveKitParticipantToken({
      config: {
        apiKey: 'test-key',
        apiSecret: 'test-secret',
        url: 'wss://example.livekit.cloud',
      },
      identity: 'visitor:visitor_123',
      roomName: 'call_generated_room',
    });
    const [, encodedPayload] = result.token.split('.');
    if (!encodedPayload) throw new Error('The issued token did not include a payload.');
    const payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8')) as {
      exp: number;
      sub: string;
      video: { room: string; roomJoin: boolean };
    };

    expect(payload.sub).toBe('visitor:visitor_123');
    expect(payload.video).toMatchObject({ room: 'call_generated_room', roomJoin: true });
    expect(payload.exp).toBeLessThanOrEqual(Math.floor(Date.now() / 1_000) + 10 * 60);
    expect(result.url).toBe('wss://example.livekit.cloud');
  });
});
