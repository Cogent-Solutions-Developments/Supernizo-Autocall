import { describe, expect, it } from 'vitest';

import { ValidationError } from '@/server/errors/app-error';

import {
  appendNotificationDeepLink,
  notificationDeepLinkFromValues,
  notificationDeepLinkPath,
} from './notification-deep-link';

const target = { siteId: 'site_123', threadId: 'thread_123', visitorId: 'visitor_123' };

describe('notification deep links', () => {
  it('builds only an internal visitor conversation path', () => {
    expect(notificationDeepLinkPath(target)).toBe(
      '/dashboard/visitors/visitor_123?siteId=site_123&threadId=thread_123',
    );
    expect(notificationDeepLinkPath(null)).toBe('/dashboard');
  });

  it('preserves validated identifiers during the SSO round trip', () => {
    const url = appendNotificationDeepLink(new URL('https://supernizo.test/autocall'), target);
    expect(notificationDeepLinkFromValues(Object.fromEntries(url.searchParams))).toEqual(target);
  });

  it('routes a validated incoming call to its dedicated workspace', () => {
    const callTarget = { callId: 'call_123' };
    const url = appendNotificationDeepLink(new URL('https://supernizo.test/autocall'), callTarget);
    expect(notificationDeepLinkFromValues(Object.fromEntries(url.searchParams))).toEqual(
      callTarget,
    );
    expect(notificationDeepLinkPath(callTarget)).toBe('/dashboard/calls/call_123');
  });

  it('rejects partial and malformed destinations', () => {
    expect(() => notificationDeepLinkFromValues({ siteId: 'site_123' })).toThrow(ValidationError);
    expect(() => notificationDeepLinkFromValues({ ...target, visitorId: '../admin' })).toThrow(
      ValidationError,
    );
  });
});
