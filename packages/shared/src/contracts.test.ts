import { describe, expect, it } from 'vitest';

import {
  CallVisitorMediaFailureRequestSchema,
  CallSchema,
  PaginationSchema,
  RequestIdSchema,
  TrackerBootstrapResponseSchema,
  UtcDateTimeSchema,
  createApiSuccessEnvelopeSchema,
} from './contracts';

describe('shared API contracts', () => {
  it('coerces bounded pagination input', () => {
    expect(PaginationSchema.parse({ limit: '10' })).toEqual({ limit: 10 });
    expect(() => PaginationSchema.parse({ limit: 101 })).toThrow();
  });

  it('accepts a UUID request ID and a UTC timestamp only', () => {
    expect(RequestIdSchema.parse('ea83fe17-031e-4e03-902c-65ad60df783d')).toBeDefined();
    expect(UtcDateTimeSchema.parse('2026-08-31T08:00:00.000Z')).toBeDefined();
    expect(() => UtcDateTimeSchema.parse('2026-08-31T08:00:00+05:30')).toThrow();
  });

  it('creates a typed success envelope schema', () => {
    const schema = createApiSuccessEnvelopeSchema(PaginationSchema.pick({ limit: true }));

    expect(
      schema.parse({
        data: { limit: 25 },
        requestId: 'ea83fe17-031e-4e03-902c-65ad60df783d',
      }),
    ).toMatchObject({ data: { limit: 25 } });
  });

  it('accepts a configured caller avatar URL and rejects unsafe values', () => {
    const call = {
      agentAvatarUrl: 'https://images.example.com/agent.jpg',
      agentDisplayName: 'Local Admin',
      id: 'call_123',
      requestedAt: '2026-08-31T08:00:00.000Z',
      roomName: 'call_room_123',
      siteId: 'site_123',
      status: 'RINGING',
      type: 'AUDIO',
      visitorId: 'visitor_123',
    };

    expect(CallSchema.parse(call).agentAvatarUrl).toBe(call.agentAvatarUrl);
    expect(() => CallSchema.parse({ ...call, agentAvatarUrl: 'javascript:alert(1)' })).toThrow();
  });

  it('accepts a public LiveKit preparation URL in tracker bootstrap data', () => {
    const result = TrackerBootstrapResponseSchema.parse({
      calling: { url: 'wss://example.livekit.cloud' },
      features: {
        audioCallEnabled: true,
        chatEnabled: true,
        trackingEnabled: true,
        videoCallEnabled: true,
      },
      heartbeatIntervalSeconds: 30,
      realtime: { authorizationToken: 'token', channel: 'visitor:site:visitor' },
      sessionId: 'ea83fe17-031e-4e03-902c-65ad60df783d',
      visitorId: '82dd49cf-8c5d-4f0b-bc8f-f48e3b71d90d',
    });

    expect(result.calling?.url).toBe('wss://example.livekit.cloud');
  });

  it('only accepts known visitor media failure codes', () => {
    const context = {
      sessionId: 'ea83fe17-031e-4e03-902c-65ad60df783d',
      sitePublicKey: 'site_12345678',
      visitorId: '82dd49cf-8c5d-4f0b-bc8f-f48e3b71d90d',
    };

    expect(
      CallVisitorMediaFailureRequestSchema.parse({
        context,
        failureCode: 'MEDIA_CAMERA_PERMISSION_DENIED',
      }).failureCode,
    ).toBe('MEDIA_CAMERA_PERMISSION_DENIED');
    expect(() =>
      CallVisitorMediaFailureRequestSchema.parse({ context, failureCode: 'UNSAFE_FAILURE' }),
    ).toThrow();
  });
});
