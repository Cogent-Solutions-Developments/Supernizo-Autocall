import { describe, expect, it } from 'vitest';

import { visitorOwnsChatThread } from './chat-service';

describe('visitor chat thread authorization', () => {
  it('does not allow a visitor to use another visitor’s thread', () => {
    expect(
      visitorOwnsChatThread(
        { siteId: 'site-a', visitorId: 'visitor-a' },
        { siteId: 'site-a', visitorId: 'visitor-b' },
      ),
    ).toBe(false);
    expect(
      visitorOwnsChatThread(
        { siteId: 'site-a', visitorId: 'visitor-a' },
        { siteId: 'site-a', visitorId: 'visitor-a' },
      ),
    ).toBe(true);
  });
});
