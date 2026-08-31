import { describe, expect, it } from 'vitest';

import {
  defaultLiveVisitorFilters,
  filterAndSortLiveVisitors,
  mergeLiveVisitorEvent,
} from './live-visitor-state';

const visitor = {
  activeDurationSeconds: 30,
  anonymousVisitorId: '11111111-1111-4111-8111-111111111111',
  browserName: 'Chrome',
  city: 'Doha',
  country: 'QA',
  currentUrl: 'https://example.com/sponsorship',
  deviceType: 'DESKTOP',
  intentScore: null,
  lastSeenAt: '2026-08-31T12:00:00.000Z',
  returningVisitCount: 1,
  sessionId: '22222222-2222-4222-8222-222222222222',
  siteId: 'site-a',
  source: 'LinkedIn',
  visitorId: 'visitor-a',
} as const;

describe('live visitor state', () => {
  it('replaces an existing visitor on an update and removes offline visitors', () => {
    const updatedVisitor = { ...visitor, activeDurationSeconds: 45 };
    const updated = mergeLiveVisitorEvent([visitor], {
      type: 'visitor.updated',
      visitor: updatedVisitor,
    });

    expect(updated).toEqual([updatedVisitor]);
    expect(
      mergeLiveVisitorEvent(updated, { type: 'visitor.offline', visitorId: visitor.visitorId }),
    ).toEqual([]);
  });

  it('filters the current state and sorts active visitors first', () => {
    const activeVisitor = { ...visitor, activeDurationSeconds: 90, visitorId: 'visitor-b' };

    expect(
      filterAndSortLiveVisitors([visitor, activeVisitor], {
        ...defaultLiveVisitorFilters,
        country: 'QA',
        source: 'LinkedIn',
      }),
    ).toEqual([activeVisitor, visitor]);
  });
});
