import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DashboardNotificationSchema } from '@supernizo/shared';

import { requireRole } from '@/server/auth/access';
import { markNotificationRead } from '@/server/services/notification-service';

import { PATCH } from './route';

vi.mock('@/server/auth/access', () => ({ requireRole: vi.fn() }));
vi.mock('@/server/services/notification-service', () => ({ markNotificationRead: vi.fn() }));

const user = {
  email: 'agent@example.com',
  id: 'agent-1',
  name: 'Agent',
  role: 'AGENT' as const,
  signInMethod: 'supernizo' as const,
};

describe('PATCH /api/notifications/[notificationId]', () => {
  beforeEach(() => vi.clearAllMocks());

  it('marks only the authenticated user notification as read', async () => {
    const notification = DashboardNotificationSchema.parse({
      createdAt: '2026-09-09T10:00:00.000Z',
      id: 'notification-1',
      messageId: 'message-1',
      preview: 'Where is registration?',
      readAt: '2026-09-09T10:01:00.000Z',
      recipientUserId: user.id,
      siteId: 'event-1',
      siteName: 'Annual Conference',
      threadId: 'thread-1',
      type: 'CHAT_MESSAGE',
      visitorId: 'visitor-1',
      visitorLabel: 'Visitor #000001',
    });
    vi.mocked(requireRole).mockResolvedValue(user);
    vi.mocked(markNotificationRead).mockResolvedValue(notification);

    const response = await PATCH(
      new Request('http://localhost/api/notifications/notification-1', {
        body: JSON.stringify({ read: true }),
        headers: { 'content-type': 'application/json' },
        method: 'PATCH',
      }),
      { params: Promise.resolve({ notificationId: 'notification-1' }) },
    );

    expect(response.status).toBe(200);
    expect(markNotificationRead).toHaveBeenCalledWith(user.id, 'notification-1');
  });

  it('rejects an invalid read payload', async () => {
    vi.mocked(requireRole).mockResolvedValue(user);

    const response = await PATCH(
      new Request('http://localhost/api/notifications/notification-1', {
        body: JSON.stringify({ read: false }),
        headers: { 'content-type': 'application/json' },
        method: 'PATCH',
      }),
      { params: Promise.resolve({ notificationId: 'notification-1' }) },
    );

    expect(response.status).toBe(400);
    expect(markNotificationRead).not.toHaveBeenCalled();
  });
});
