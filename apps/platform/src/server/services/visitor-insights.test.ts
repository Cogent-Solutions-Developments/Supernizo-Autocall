import { describe, expect, it } from 'vitest';

import {
  buildVisitorMetrics,
  mergeTimelineEntries,
  type VisitorTimelineEntry,
} from './visitor-insights';

const pageView: VisitorTimelineEntry = {
  activeDurationSeconds: 24,
  id: 'page-1',
  kind: 'page_view',
  maxScrollPercent: 75,
  name: 'Pricing',
  occurredAt: '2026-08-31T10:02:00.000Z',
  path: '/pricing',
  title: 'Pricing',
  type: 'page_view',
};

describe('visitor insights', () => {
  it('merges page views and events in reverse chronological order with a cursor', () => {
    const result = mergeTimelineEntries(
      [pageView],
      [
        {
          activeDurationSeconds: null,
          id: 'event-1',
          kind: 'event',
          maxScrollPercent: null,
          name: 'Download brochure',
          occurredAt: '2026-08-31T10:03:00.000Z',
          path: null,
          title: null,
          type: 'cta_click',
        },
        {
          activeDurationSeconds: null,
          id: 'event-0',
          kind: 'event',
          maxScrollPercent: null,
          name: 'Started form',
          occurredAt: '2026-08-31T10:01:00.000Z',
          path: null,
          title: null,
          type: 'form_start',
        },
      ],
      2,
    );

    expect(result.entries.map((entry) => entry.id)).toEqual(['event-1', 'page-1']);
    expect(result.nextCursor).toEqual({
      id: 'page-1',
      kind: 'page_view',
      occurredAt: '2026-08-31T10:02:00.000Z',
    });
  });

  it('derives new, returning, and active-time metrics', () => {
    expect(
      buildVisitorMetrics({
        averageActiveSessionSeconds: 62.6,
        newVisitors: 3,
        totalVisitors: 8,
      }),
    ).toEqual({
      averageActiveSessionSeconds: 63,
      newVisitors: 3,
      returningVisitors: 5,
      totalVisitors: 8,
    });
  });
});
