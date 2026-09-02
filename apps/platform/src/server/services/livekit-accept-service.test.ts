import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  acceptVisitorCall: vi.fn(),
}));

vi.mock('@/server/livekit/config', () => ({
  getLiveKitServerConfig: () => ({
    apiKey: 'test-key',
    apiSecret: 'test-secret',
    url: 'wss://example.livekit.cloud',
  }),
}));
vi.mock('./call-service', () => ({
  acceptVisitorCall: mocks.acceptVisitorCall,
  transitionCall: vi.fn(),
}));
vi.mock('./tracker-engagement-service', () => ({ resolveTrackingContext: vi.fn() }));

import { acceptVisitorCallWithMedia } from './livekit-token-service';

describe('visitor call acceptance media bootstrap', () => {
  it('returns room credentials with the accepted call in one service operation', async () => {
    mocks.acceptVisitorCall.mockResolvedValue({
      agentAvatarUrl: null,
      agentDisplayName: 'Local Admin',
      id: 'call_123',
      requestedAt: '2026-09-02T08:00:00.000Z',
      roomName: 'call_room',
      siteId: 'site_123',
      status: 'ACCEPTED',
      type: 'AUDIO',
      visitorId: 'visitor_123',
    });
    const context = {
      sessionId: 'session_123',
      sitePublicKey: 'site_public_key_123',
      visitorId: 'anonymous_visitor_123',
    };

    const result = await acceptVisitorCallWithMedia(
      'call_123',
      'https://event.example.com',
      context,
    );

    expect(mocks.acceptVisitorCall).toHaveBeenCalledWith(
      'call_123',
      'https://event.example.com',
      context,
      undefined,
    );
    expect(result.call.status).toBe('ACCEPTED');
    expect(result.media.url).toBe('wss://example.livekit.cloud');

    const [, encodedPayload] = result.media.token.split('.');
    if (!encodedPayload) throw new Error('The media token did not contain a payload.');
    const payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8')) as {
      sub: string;
      video: { room: string };
    };
    expect(payload.sub).toBe('visitor:visitor_123');
    expect(payload.video.room).toBe('call_room');
  });
});
