import 'server-only';

import {
  DashboardNotificationSchema,
  type ChatMessage,
  type DashboardNotification,
} from '@supernizo/shared';
import type { Prisma } from '@generated/prisma/client';

import { getDatabaseClient } from '@/server/db/client';
import { getEnvironmentReadiness } from '@/server/env';
import { NotFoundError } from '@/server/errors/app-error';
import { UpstashRealtimeProvider } from '@/server/realtime';

const notificationSelect = {
  createdAt: true,
  id: true,
  messageId: true,
  preview: true,
  readAt: true,
  recipientUserId: true,
  siteId: true,
  siteName: true,
  threadId: true,
  type: true,
  visitorId: true,
  visitorLabel: true,
} satisfies Prisma.NotificationSelect;

type NotificationRow = Prisma.NotificationGetPayload<{ select: typeof notificationSelect }>;

function mapNotification(notification: NotificationRow): DashboardNotification {
  return DashboardNotificationSchema.parse({
    ...notification,
    createdAt: notification.createdAt.toISOString(),
    readAt: notification.readAt?.toISOString() ?? null,
  });
}

export function userNotificationChannel(userId: string): string {
  return `user:${userId}`;
}

function messagePreview(content: string): string {
  return content.trim().slice(0, 500);
}

async function emitNotifications(notifications: readonly DashboardNotification[]): Promise<void> {
  if (notifications.length === 0 || !getEnvironmentReadiness().realtime) return;

  const realtime = new UpstashRealtimeProvider();
  const results = await Promise.allSettled(
    notifications.map((notification) =>
      realtime.emitToChannel(userNotificationChannel(notification.recipientUserId), {
        type: 'notification.created',
        notification,
      }),
    ),
  );

  for (const result of results) {
    if (result.status === 'rejected') {
      console.error('Notification realtime delivery failed.', {
        errorName: result.reason instanceof Error ? result.reason.name : 'UnknownError',
      });
    }
  }
}

export async function createChatMessageNotifications(
  message: ChatMessage,
  scope: Readonly<{ siteId: string; visitorId: string }>,
): Promise<DashboardNotification[]> {
  if (message.senderType !== 'VISITOR') return [];

  const database = getDatabaseClient();
  const [site, visitor, recipients] = await Promise.all([
    database.site.findUnique({ where: { id: scope.siteId }, select: { name: true } }),
    database.visitor.findUnique({
      where: { id: scope.visitorId },
      select: {
        identities: {
          orderBy: { linkedAt: 'desc' },
          select: { displayName: true },
          take: 1,
        },
      },
    }),
    database.user.findMany({
      where: {
        OR: [
          { globalRole: 'ADMIN', supernizoId: null },
          { supernizoState: { is: { eligibility: 'ELIGIBLE' } } },
        ],
      },
      select: { id: true },
    }),
  ]);

  if (!site || recipients.length === 0) return [];

  const visitorLabel =
    visitor?.identities[0]?.displayName?.trim() || `Visitor #${scope.visitorId.slice(-6)}`;
  const preview = messagePreview(message.content);
  const created = await database.notification.createManyAndReturn({
    data: recipients.map(({ id }) => ({
      messageId: message.id,
      preview,
      recipientUserId: id,
      siteId: scope.siteId,
      siteName: site.name,
      threadId: message.threadId,
      type: 'CHAT_MESSAGE' as const,
      visitorId: scope.visitorId,
      visitorLabel,
    })),
    select: notificationSelect,
    skipDuplicates: true,
  });
  const notifications = created.map(mapNotification);

  await emitNotifications(notifications);
  return notifications;
}

export async function listNotificationsForUser(
  recipientUserId: string,
  input: Readonly<{ limit: number; unreadOnly: boolean }>,
): Promise<DashboardNotification[]> {
  const notifications = await getDatabaseClient().notification.findMany({
    where: {
      recipientUserId,
      ...(input.unreadOnly ? { readAt: null } : {}),
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    select: notificationSelect,
    take: input.limit,
  });

  return notifications.map(mapNotification);
}

export async function markNotificationRead(
  recipientUserId: string,
  notificationId: string,
): Promise<DashboardNotification> {
  const database = getDatabaseClient();
  await database.notification.updateMany({
    where: { id: notificationId, readAt: null, recipientUserId },
    data: { readAt: new Date() },
  });

  const notification = await database.notification.findFirst({
    where: { id: notificationId, recipientUserId },
    select: notificationSelect,
  });
  if (!notification) throw new NotFoundError('The notification does not exist.');

  return mapNotification(notification);
}
