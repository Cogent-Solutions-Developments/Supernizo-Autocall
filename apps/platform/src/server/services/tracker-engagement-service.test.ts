import { describe, expect, it } from 'vitest';

import { ConflictError } from '@/server/errors/app-error';

import { assertTrackingContextRelationships } from './tracker-engagement-service';

describe('assertTrackingContextRelationships', () => {
  it('rejects a visitor and session mismatch', () => {
    expect(() =>
      assertTrackingContextRelationships({
        sessionSiteId: 'site-a',
        sessionVisitorId: 'visitor-b',
        siteId: 'site-a',
        visitorId: 'visitor-a',
        visitorSiteId: 'site-a',
      }),
    ).toThrow(ConflictError);
  });

  it('accepts a context whose site, visitor, and session agree', () => {
    expect(() =>
      assertTrackingContextRelationships({
        sessionSiteId: 'site-a',
        sessionVisitorId: 'visitor-a',
        siteId: 'site-a',
        visitorId: 'visitor-a',
        visitorSiteId: 'site-a',
      }),
    ).not.toThrow();
  });
});
