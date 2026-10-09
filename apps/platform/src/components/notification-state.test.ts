import { describe, expect, it } from 'vitest';

import { DashboardNotificationSchema, type DashboardNotification } from '@supernizo/shared';

import {
  markDashboardNotificationRead,
  mergeDashboardNotification,
  unreadNotificationCount,
} from './notification-state';

function notification(
  id: string,
  createdAt: string,
  readAt: string | null = null,
): DashboardNotification {
  return DashboardNotificationSchema.parse({
    createdAt,
    id,
    messageId: `message-${id}`,
    preview: 'Where is the registration desk?',
    readAt,
    recipientUserId: 'agent-1',
    siteId: 'event-1',
    siteName: 'Annual Conference',
    threadId: 'thread-1',
    type: 'CHAT_MESSAGE',
    visitorId: 'visitor-1',
    visitorLabel: 'Visitor #000001',
  });
}

describe('dashboard notification state', () => {
  it('deduplicates realtime deliveries and keeps newest notifications first', () => {
    const older = notification('older', '2026-09-09T10:00:00.000Z');
    const newer = notification('newer', '2026-09-09T11:00:00.000Z');

    expect(mergeDashboardNotification([older, newer], newer)).toEqual([newer, older]);
  });

  it('marks only the selected notification as read and counts the remaining unread items', () => {
    const first = notification('first', '2026-09-09T10:00:00.000Z');
    const second = notification('second', '2026-09-09T11:00:00.000Z');
    const updated = markDashboardNotificationRead(
      [first, second],
      first.id,
      '2026-09-09T12:00:00.000Z',
    );

    expect(updated[0]?.readAt).toBe('2026-09-09T12:00:00.000Z');
    expect(updated[1]?.readAt).toBeNull();
    expect(unreadNotificationCount(updated)).toBe(1);
  });
});
