import { describe, expect, it } from 'vitest';

import { resolveVisitorRealtimeToken } from './realtime-request-handler';

describe('resolveVisitorRealtimeToken', () => {
  it('uses a path token so the realtime client can append its own query parameters', () => {
    const request = new Request('http://localhost:3000/api/realtime/token?channel=visitor%3Asite');

    expect(resolveVisitorRealtimeToken(request, 'signed-token')).toBe('signed-token');
  });

  it('supports the legacy query token for existing dashboard clients', () => {
    const request = new Request('http://localhost:3000/api/realtime?visitor_token=legacy-token');

    expect(resolveVisitorRealtimeToken(request)).toBe('legacy-token');
  });
});
