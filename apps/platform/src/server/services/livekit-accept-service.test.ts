import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  acceptVisitorCall: vi.fn(),
  createCall: vi.fn(),
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
  createCall: mocks.createCall,
  transitionCall: vi.fn(),
}));
vi.mock('./tracker-engagement-service', () => ({ resolveTrackingContext: vi.fn() }));

import { acceptVisitorCallWithMedia, createCallWithAgentMedia } from './livekit-token-service';

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

describe('agent call media preparation', () => {
  it('returns an agent room token with the newly created call', async () => {
    mocks.createCall.mockResolvedValue({
      agentAvatarUrl: null,
      agentDisplayName: 'Local Admin',
      id: 'call_456',
      requestedAt: '2026-09-02T08:00:00.000Z',
      roomName: 'call_agent_room',
      siteId: 'site_123',
      status: 'RINGING',
      type: 'VIDEO',
      visitorId: 'visitor_123',
    });

    const result = await createCallWithAgentMedia({
      agentId: 'agent_123',
      siteId: 'site_123',
      type: 'VIDEO',
      visitorId: 'visitor_123',
    });

    expect(result.call.status).toBe('RINGING');
    expect(result.media.url).toBe('wss://example.livekit.cloud');
    const [, encodedPayload] = result.media.token.split('.');
    if (!encodedPayload) throw new Error('The media token did not contain a payload.');
    const payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8')) as {
      sub: string;
      video: { room: string };
    };
    expect(payload.sub).toBe('agent:agent_123');
    expect(payload.video.room).toBe('call_agent_room');
  });
});
