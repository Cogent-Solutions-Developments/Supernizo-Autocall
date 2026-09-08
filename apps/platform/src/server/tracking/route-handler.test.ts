import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

vi.mock('@/server/logging/logger', () => ({
  logger: { log: vi.fn() },
}));
vi.mock('./rate-limit', () => ({
  enforceTrackingRateLimit: vi.fn(),
}));

import { ConflictError } from '@/server/errors/app-error';

import { handleTrackingRequest } from './route-handler';

describe('handleTrackingRequest', () => {
  it('includes the requesting origin on error responses', async () => {
    const origin = 'https://example.com';
    const response = await handleTrackingRequest(
      new Request('https://autocallplatform.vercel.app/api/track/heartbeat', {
        body: '{}',
        headers: {
          'content-type': 'application/json',
          origin,
          'x-request-id': '6ea1dceb-89fd-4cef-8670-a823e5eb7afc',
        },
        method: 'POST',
      }),
      z.object({}),
      'heartbeat',
      async () => {
        throw new ConflictError('The tracking page view does not belong to this session.');
      },
    );

    expect(response.status).toBe(409);
    expect(response.headers.get('access-control-allow-origin')).toBe(origin);
  });
});
