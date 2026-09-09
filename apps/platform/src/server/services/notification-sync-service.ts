import 'server-only';

import {
  NotificationSyncItemSchema,
  NotificationSyncPageResponseSchema,
  type NotificationSyncItem,
  type NotificationSyncPageRequest,
  type NotificationSyncPageResponse,
} from '@supernizo/shared';
import type { Prisma } from '@generated/prisma/client';

import { getDatabaseClient } from '@/server/db/client';

const notificationSyncSelect = {
  createdAt: true,
  id: true,
  messageId: true,
  preview: true,
  readAt: true,
  recipient: { select: { supernizoId: true } },
  siteId: true,
  siteName: true,
  threadId: true,
  type: true,
  updatedAt: true,
  visitorId: true,
  visitorLabel: true,
} satisfies Prisma.NotificationSelect;

type NotificationSyncRow = Prisma.NotificationGetPayload<{
  select: typeof notificationSyncSelect;
}>;

function mapNotificationSyncItem(notification: NotificationSyncRow): NotificationSyncItem {
  return NotificationSyncItemSchema.parse({
    createdAt: notification.createdAt.toISOString(),
    messageId: notification.messageId,
    preview: notification.preview,
    readAt: notification.readAt?.toISOString() ?? null,
    recipientSubject: notification.recipient.supernizoId,
    siteId: notification.siteId,
    siteName: notification.siteName,
    sourceNotificationId: notification.id,
    threadId: notification.threadId,
    type: notification.type,
    updatedAt: notification.updatedAt.toISOString(),
    visitorId: notification.visitorId,
    visitorLabel: notification.visitorLabel,
  });
}

export async function listNotificationSyncPage(
  input: NotificationSyncPageRequest,
): Promise<NotificationSyncPageResponse> {
  const cursor = input.cursor;
  const notifications = await getDatabaseClient().notification.findMany({
    where: {
      recipient: { supernizoId: { not: null } },
      ...(cursor
        ? {
            OR: [
              { updatedAt: { gt: new Date(cursor.updatedAt) } },
              {
                updatedAt: new Date(cursor.updatedAt),
                id: { gt: cursor.id },
              },
            ],
          }
        : {}),
    },
    orderBy: [{ updatedAt: 'asc' }, { id: 'asc' }],
    select: notificationSyncSelect,
    take: input.limit,
  });
  const items = notifications.map(mapNotificationSyncItem);
  const last = items.at(-1);

  return NotificationSyncPageResponseSchema.parse({
    nextCursor: last ? { id: last.sourceNotificationId, updatedAt: last.updatedAt } : null,
    notifications: items,
    schemaVersion: 1,
  });
}
