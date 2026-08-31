import { describe, expect, it } from 'vitest';

import { ForbiddenError } from '@/server/errors/app-error';

import { getPublicRequestOrigin } from './public-route';

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
});
