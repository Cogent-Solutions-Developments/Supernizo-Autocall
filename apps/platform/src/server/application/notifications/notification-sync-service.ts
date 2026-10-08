import type { NotificationSyncRepository } from '@/server/application/ports/notification-sync-repository';
import 'server-only';
import {
  NotificationSyncItemSchema,
  NotificationSyncPageResponseSchema,
  type NotificationSyncItem,
  type NotificationSyncPageRequest,
  type NotificationSyncPageResponse,
} from '@supernizo/shared';

type NotificationSyncRow = Awaited<ReturnType<NotificationSyncRepository['listSyncPage']>>[number];
export function createNotificationSyncService(dependencies: {
  repository: NotificationSyncRepository;
}) {
  const { repository } = dependencies;
  function mapNotification(notification: NotificationSyncRow): NotificationSyncItem {
    return NotificationSyncItemSchema.parse({
      callId: notification.callId ?? null,
      createdAt: notification.createdAt.toISOString(),
      messageId: notification.messageId,
      preview: notification.preview,
      recipientSubject: notification.recipient.supernizoId,
      siteId: notification.siteId,
      siteName: notification.siteName,
      sourceNotificationId: notification.id,
      threadId: notification.threadId,
      type: notification.type,
      visitorId: notification.visitorId,
      visitorLabel: notification.visitorLabel,
    });
  }

  async function listNotificationSyncPage(
    input: NotificationSyncPageRequest,
  ): Promise<NotificationSyncPageResponse> {
    const cursor = input.cursor;
    const notifications = await repository.listSyncPage(cursor, input);
    const items = notifications.map(mapNotification);
    const last = items.at(-1);

    return NotificationSyncPageResponseSchema.parse({
      nextCursor: last ? { createdAt: last.createdAt, id: last.sourceNotificationId } : null,
      notifications: items,
      schemaVersion: 1,
    });
  }
  return { listNotificationSyncPage };
}
