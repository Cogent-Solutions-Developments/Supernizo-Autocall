import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getDatabaseClient } from '@/server/db/client';

import { listNotificationSyncPage } from './notification-sync-service';

vi.mock('@/server/db/client', () => ({ getDatabaseClient: vi.fn() }));

const recipientSubject = 'ea83fe17-031e-4e03-902c-65ad60df783d';

function row(id: string, updatedAt: string) {
  return {
    createdAt: new Date('2026-09-09T08:00:00.000Z'),
    id,
    messageId: `message_${id}`,
    preview: 'Could you help me?',
    readAt: null,
    recipient: { supernizoId: recipientSubject },
    siteId: 'site_123',
    siteName: 'Example site',
    threadId: 'thread_123',
    type: 'CHAT_MESSAGE' as const,
    updatedAt: new Date(updatedAt),
    visitorId: 'visitor_123',
    visitorLabel: 'Visitor 123',
  };
}

describe('notification sync service', () => {
  const findMany = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getDatabaseClient).mockReturnValue({
      notification: { findMany },
    } as unknown as ReturnType<typeof getDatabaseClient>);
  });

  it('returns mapped users and a cursor from the last ordered row', async () => {
    findMany.mockResolvedValue([
      row('notification_1', '2026-09-09T08:00:01.000Z'),
      row('notification_2', '2026-09-09T08:00:02.000Z'),
    ]);

    const page = await listNotificationSyncPage({ cursor: null, limit: 2, schemaVersion: 1 });

    expect(page.notifications).toHaveLength(2);
    expect(page.notifications[0]).toMatchObject({
      recipientSubject,
      sourceNotificationId: 'notification_1',
      type: 'CHAT_MESSAGE',
    });
    expect(page.nextCursor).toEqual({
      id: 'notification_2',
      updatedAt: '2026-09-09T08:00:02.000Z',
    });
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [{ updatedAt: 'asc' }, { id: 'asc' }],
        take: 2,
        where: { recipient: { supernizoId: { not: null } } },
      }),
    );
  });

  it('uses an exclusive compound cursor and returns null for an empty page', async () => {
    findMany.mockResolvedValue([]);
    const updatedAt = '2026-09-09T08:00:02.000Z';

    const page = await listNotificationSyncPage({
      cursor: { id: 'notification_2', updatedAt },
      limit: 100,
      schemaVersion: 1,
    });

    expect(page).toEqual({ nextCursor: null, notifications: [], schemaVersion: 1 });
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          recipient: { supernizoId: { not: null } },
          OR: [
            { updatedAt: { gt: new Date(updatedAt) } },
            { updatedAt: new Date(updatedAt), id: { gt: 'notification_2' } },
          ],
        },
      }),
    );
  });
});
