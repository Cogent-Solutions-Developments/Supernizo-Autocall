import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

vi.mock('@/server/logging/logger', () => ({
  logger: { log: vi.fn() },
}));
vi.mock('@/server/tracking/rate-limit', () => ({
  enforceTrackingRateLimit: vi.fn(),
}));

import { ConflictError, ForbiddenError } from '@/server/errors/app-error';

import { getPublicRequestOrigin, handlePublicChatRequest } from './public-route';

describe('getPublicRequestOrigin', () => {
  it('uses the Origin request header when supplied', () => {
    const request = new Request('https://platform.example/api/chat/visitor/thread', {
      headers: { origin: 'https://tracked.example' },
    });

    expect(getPublicRequestOrigin(request)).toBe('https://tracked.example');
  });

  it('uses the referrer origin for a same-origin browser GET', () => {
    const request = new Request('http://localhost:3000/api/chat/visitor/thread', {
      headers: { referer: 'http://localhost:3000/sdk/fixture.html' },
    });

    expect(getPublicRequestOrigin(request)).toBe('http://localhost:3000');
  });

  it('rejects requests that have no usable browser origin', () => {
    const request = new Request('https://platform.example/api/chat/visitor/thread');

    expect(() => getPublicRequestOrigin(request)).toThrow(ForbiddenError);
  });

  it('includes the resolved origin when a public call handler fails', async () => {
    const origin = 'https://upstream-angola-nextjs.vercel.app';
    const response = await handlePublicChatRequest(
      new Request('https://autocallplatform.vercel.app/api/calls/call-id/accept', {
        body: '{}',
        headers: { 'content-type': 'application/json', origin },
        method: 'POST',
      }),
      z.object({}),
      'call-accept',
      async () => {
        throw new ConflictError('The call cannot be accepted.');
      },
    );

    expect(response.status).toBe(409);
    expect(response.headers.get('access-control-allow-origin')).toBe(origin);
    expect(response.headers.get('vary')).toBe('Origin');
  });

  it('includes the resolved origin on an unexpected public call error', async () => {
    const origin = 'https://upstream-angola-nextjs.vercel.app';
    const response = await handlePublicChatRequest(
      new Request('https://autocallplatform.vercel.app/api/calls/call-id/accept', {
        body: '{}',
        headers: { 'content-type': 'application/json', origin },
        method: 'POST',
      }),
      z.object({}),
      'call-accept',
      async () => {
        throw new Error('Database unavailable.');
      },
    );

    expect(response.status).toBe(500);
    expect(response.headers.get('access-control-allow-origin')).toBe(origin);
    expect(response.headers.get('vary')).toBe('Origin');
  });
});
