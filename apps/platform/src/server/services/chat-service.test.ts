import { describe, expect, it, vi } from 'vitest';

import { getDatabaseClient } from '@/server/db/client';

import { chatThreadBelongsToVisitor, visitorOwnsChatThread } from './chat-service';

vi.mock('@/server/db/client', () => ({ getDatabaseClient: vi.fn() }));

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

describe('dashboard notification thread authorization', () => {
  it('accepts only the thread matching both the site and visitor', async () => {
    vi.mocked(getDatabaseClient).mockReturnValue({
      chatThread: {
        findUnique: vi.fn().mockResolvedValue({ siteId: 'site-a', visitorId: 'visitor-a' }),
      },
    } as unknown as ReturnType<typeof getDatabaseClient>);

    await expect(chatThreadBelongsToVisitor('thread-a', 'site-a', 'visitor-a')).resolves.toBe(true);
    await expect(chatThreadBelongsToVisitor('thread-a', 'site-b', 'visitor-a')).resolves.toBe(
      false,
    );
    await expect(chatThreadBelongsToVisitor('thread-a', 'site-a', 'visitor-b')).resolves.toBe(
      false,
    );
  });
});
