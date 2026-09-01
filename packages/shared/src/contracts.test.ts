import { describe, expect, it } from 'vitest';

import {
  CallSchema,
  PaginationSchema,
  RequestIdSchema,
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
});
