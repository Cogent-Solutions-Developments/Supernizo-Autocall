import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ChatMessage } from '@supernizo/shared';

import { getDatabaseClient } from '@/server/db/client';
import { getEnvironmentReadiness } from '@/server/env';

import {
  createChatMessageNotifications,
  markNotificationRead,
  userNotificationChannel,
} from './notification-service';

vi.mock('@/server/db/client', () => ({ getDatabaseClient: vi.fn() }));
vi.mock('@/server/env', () => ({ getEnvironmentReadiness: vi.fn() }));

const message: ChatMessage = {
  content: 'Where is the registration desk?',
  id: 'message-1',
  senderName: 'Visitor',
  senderType: 'VISITOR',
  sentAt: '2026-09-09T10:00:00.000Z',
  threadId: 'thread-1',
};

describe('notification service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getEnvironmentReadiness).mockReturnValue({
      appUrl: true,
      auth: true,
      database: true,
      geoIp: true,
      livekit: true,
      realtime: false,
      redis: true,
      trackingIpHash: true,
    });
  });

  it('creates an event-labelled notification for every linked Supernizo user', async () => {
    const createManyAndReturn = vi.fn().mockResolvedValue([
      {
        createdAt: new Date(message.sentAt),
        id: 'notification-1',
        messageId: message.id,
        preview: message.content,
        readAt: null,
        recipientUserId: 'agent-1',
        siteId: 'event-1',
        siteName: 'Annual Conference',
        threadId: message.threadId,
        type: 'CHAT_MESSAGE',
        visitorId: 'visitor-1',
        visitorLabel: 'Registered visitor',
      },
    ]);
    const findMany = vi.fn().mockResolvedValue([{ id: 'agent-1' }]);
    vi.mocked(getDatabaseClient).mockReturnValue({
      notification: { createManyAndReturn },
      site: { findUnique: vi.fn().mockResolvedValue({ name: 'Annual Conference' }) },
      user: { findMany },
      visitor: {
        findUnique: vi.fn().mockResolvedValue({
          identities: [{ displayName: 'Registered visitor' }],
        }),
      },
    } as unknown as ReturnType<typeof getDatabaseClient>);

    const created = await createChatMessageNotifications(message, {
      siteId: 'event-1',
      visitorId: 'visitor-1',
    });

    expect(created).toEqual([expect.objectContaining({ siteName: 'Annual Conference' })]);
    expect(findMany).toHaveBeenCalledWith({
      select: { id: true },
      where: {
        OR: [{ globalRole: 'ADMIN', supernizoId: null }, { supernizoId: { not: null } }],
      },
    });
    expect(createManyAndReturn).toHaveBeenCalledWith(
      expect.objectContaining({
        data: [
          expect.objectContaining({
            recipientUserId: 'agent-1',
            siteId: 'event-1',
            siteName: 'Annual Conference',
          }),
        ],
        skipDuplicates: true,
      }),
    );
  });

  it('does not notify agents about an agent-authored message', async () => {
    const result = await createChatMessageNotifications(
      { ...message, senderType: 'AGENT' },
      { siteId: 'event-1', visitorId: 'visitor-1' },
    );

    expect(result).toEqual([]);
    expect(getDatabaseClient).not.toHaveBeenCalled();
  });

  it('does not allow one user to mark another user notification as read', async () => {
    vi.mocked(getDatabaseClient).mockReturnValue({
      notification: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
    } as unknown as ReturnType<typeof getDatabaseClient>);

    await expect(markNotificationRead('agent-1', 'notification-2')).rejects.toThrow(
      'notification does not exist',
    );
  });

  it('builds a private user channel', () => {
    expect(userNotificationChannel('agent-1')).toBe('user:agent-1');
  });
});
