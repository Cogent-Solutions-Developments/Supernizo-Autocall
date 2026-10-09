import { describe, expect, it, vi } from 'vitest';

import { getDatabaseClient } from '@/server/infrastructure/db/client';

import {
  getChatHistory,
  chatThreadBelongsToVisitor,
  visitorOwnsChatThread,
} from '@/server/composition/chat/chat-service';

vi.mock('@/server/infrastructure/db/client', () => ({ getDatabaseClient: vi.fn() }));

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

describe('chat sender profiles', () => {
  it('returns each messaging user profile in history without leaking it onto visitor messages', async () => {
    const photo = 'data:image/png;base64,iVBORw0KGgo=';
    const agent = {
      displayName: 'Directory name',
      profile: { displayName: 'Alice', imageUrl: photo },
    };
    const base = {
      content: 'Hello',
      threadId: 'thread_1',
      sentAt: new Date('2026-10-09T10:00:00.000Z'),
    };
    vi.mocked(getDatabaseClient).mockReturnValue({
      chatMessage: {
        findMany: vi.fn().mockResolvedValue([
          { ...base, id: 'message_2', senderType: 'VISITOR', agent: null },
          { ...base, id: 'message_1', senderType: 'AGENT', agent },
        ]),
      },
    } as unknown as ReturnType<typeof getDatabaseClient>);
    const history = await getChatHistory('thread_1', {});
    expect(history?.messages).toMatchObject([
      { senderName: 'Alice', senderAvatarUrl: photo },
      { senderName: 'Visitor', senderAvatarUrl: null },
    ]);
  });
});
