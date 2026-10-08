import 'server-only';
import { Prisma, type PrismaClient } from '@generated/prisma/client';
import { getDatabaseClient } from '@/server/infrastructure/db/client';
import type {
  NotificationSyncRepository,
  NotificationSyncRepositorySession,
} from '@/server/application/ports/notification-sync-repository';
const notificationSyncSelect = {
  callId: true,
  createdAt: true,
  id: true,
  messageId: true,
  preview: true,
  recipient: { select: { supernizoId: true } },
  siteId: true,
  siteName: true,
  threadId: true,
  type: true,
  visitorId: true,
  visitorLabel: true,
} satisfies Prisma.NotificationSelect;

function bindRepository(
  getClient: () => Prisma.TransactionClient,
): NotificationSyncRepositorySession {
  return {
    async listSyncPage(cursor, input) {
      const database = getClient();
      return database.notification.findMany({
        where: {
          recipient: { supernizoId: { not: null } },
          ...(cursor
            ? {
                OR: [
                  { createdAt: { gt: new Date(cursor.createdAt) } },
                  { createdAt: new Date(cursor.createdAt), id: { gt: cursor.id } },
                ],
              }
            : {}),
        },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        select: notificationSyncSelect,
        take: input.limit,
      });
    },
  };
}

export function createNotificationSyncRepository(
  getClient: () => PrismaClient = getDatabaseClient,
): NotificationSyncRepository {
  return { ...bindRepository(getClient) };
}
