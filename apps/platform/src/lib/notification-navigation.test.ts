import { describe, expect, it } from 'vitest';

import { visitorChatHref } from './notification-navigation';

describe('visitorChatHref', () => {
  it('opens the notified visitor with the exact chat thread selected', () => {
    expect(
      visitorChatHref({
        siteId: 'site_123',
        threadId: 'thread_123',
        visitorId: 'visitor_123',
      }),
    ).toBe('/dashboard/visitors/visitor_123?siteId=site_123&threadId=thread_123');
  });
});
