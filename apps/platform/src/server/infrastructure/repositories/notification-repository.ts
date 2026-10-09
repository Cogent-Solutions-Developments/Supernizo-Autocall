import 'server-only';
import { Prisma, type PrismaClient } from '@generated/prisma/client';
import { getDatabaseClient } from '@/server/infrastructure/db/client';
import type {
  NotificationRepository,
  NotificationRepositorySession,
} from '@/server/application/ports/notification-repository';
const notificationSelect = {
  callId: true,
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

function bindRepository(getClient: () => Prisma.TransactionClient): NotificationRepositorySession {
  return {
    async getSiteName(scope) {
      const database = getClient();
      return database.site.findUnique({ where: { id: scope.siteId }, select: { name: true } });
    },
    async getVisitorLabel(scope) {
      const database = getClient();
      return database.visitor.findUnique({
        where: { id: scope.visitorId },
        select: {
          identities: {
            orderBy: { linkedAt: 'desc' },
            select: { displayName: true },
            take: 1,
          },
        },
      });
    },
    async listRecipients() {
      const database = getClient();
      return database.user.findMany({
        where: {
          OR: [{ globalRole: 'ADMIN', supernizoId: null }, { supernizoId: { not: null } }],
        },
        select: { id: true },
      });
    },
    async createMessageNotifications(recipients, message, preview, scope, site, visitorLabel) {
      const database = getClient();
      return database.notification.createManyAndReturn({
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
    },
    async upsertIncomingCall(input) {
      const database = getClient();
      return database.notification.upsert({
        where: {
          recipientUserId_type_callId: {
            callId: input.callId,
            recipientUserId: input.recipientUserId,
            type: 'INCOMING_CALL',
          },
        },
        create: {
          callId: input.callId,
          preview: `Visitor is requesting a ${input.type === 'VIDEO' ? 'video' : 'voice'} call.`,
          recipientUserId: input.recipientUserId,
          siteId: input.siteId,
          siteName: input.siteName,
          type: 'INCOMING_CALL',
          visitorId: input.visitorId,
          visitorLabel: input.visitorLabel,
        },
        update: {},
        select: notificationSelect,
      });
    },
    async listForRecipient(recipientUserId, input) {
      const database = getClient();
      return database.notification.findMany({
        where: {
          recipientUserId,
          ...(input.unreadOnly ? { readAt: null } : {}),
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        select: notificationSelect,
        take: input.limit,
      });
    },
    async markRead(notificationId, recipientUserId) {
      const database = getClient();
      return database.notification.updateMany({
        where: { id: notificationId, recipientUserId },
        data: { readAt: new Date() },
      });
    },
    async getNotification(notificationId) {
      const database = getClient();
      return database.notification.findUniqueOrThrow({
        where: { id: notificationId },
        select: notificationSelect,
      });
    },
  };
}

export function createNotificationRepository(
  getClient: () => PrismaClient = getDatabaseClient,
): NotificationRepository {
  return { ...bindRepository(getClient) };
}
