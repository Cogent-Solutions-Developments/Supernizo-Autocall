import type { NotificationRepository } from '@/server/application/ports/notification-repository';
import 'server-only';
import {
  DashboardNotificationSchema,
  type ChatMessage,
  type DashboardNotification,
} from '@supernizo/shared';
import { NotFoundError } from '@/server/domain/errors/app-error';
import type { RuntimeProviders } from '@/server/application/ports/runtime-providers';
type NotificationRow = Awaited<ReturnType<NotificationRepository['getNotification']>>;
export function createNotificationService(
  dependencies: Pick<RuntimeProviders, 'getEnvironmentReadiness' | 'getRealtimeProvider'> & {
    repository: NotificationRepository;
  },
) {
  const { repository, getEnvironmentReadiness, getRealtimeProvider } = dependencies;
  function mapNotification(notification: NotificationRow): DashboardNotification {
    return DashboardNotificationSchema.parse({
      ...notification,
      createdAt: notification.createdAt.toISOString(),
      readAt: notification.readAt?.toISOString() ?? null,
    });
  }

  function userNotificationChannel(userId: string): string {
    return `user:${userId}`;
  }

  function messagePreview(content: string): string {
    return content.trim().slice(0, 500);
  }

  async function emitNotifications(notifications: readonly DashboardNotification[]): Promise<void> {
    if (notifications.length === 0 || !getEnvironmentReadiness().realtime) return;

    const realtime = getRealtimeProvider();
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

  async function createChatMessageNotifications(
    message: ChatMessage,
    scope: Readonly<{ siteId: string; visitorId: string }>,
  ): Promise<DashboardNotification[]> {
    if (message.senderType !== 'VISITOR') return [];

    const [site, visitor, recipients] = await Promise.all([
      repository.getSiteName(scope),
      repository.getVisitorLabel(scope),
      repository.listRecipients(),
    ]);

    if (!site || recipients.length === 0) return [];

    const visitorLabel =
      visitor?.identities[0]?.displayName?.trim() || `Visitor #${scope.visitorId.slice(-6)}`;
    const preview = messagePreview(message.content);
    const created = await repository.createMessageNotifications(
      recipients,
      message,
      preview,
      scope,
      site,
      visitorLabel,
    );
    const notifications = created.map(mapNotification);

    await emitNotifications(notifications);
    return notifications;
  }

  async function createIncomingCallNotification(
    input: Readonly<{
      callId: string;
      recipientUserId: string;
      siteId: string;
      siteName: string;
      visitorId: string;
      visitorLabel: string;
      type: 'AUDIO' | 'VIDEO';
    }>,
  ): Promise<DashboardNotification | null> {
    const notification = await repository.upsertIncomingCall(input);
    const mapped = mapNotification(notification);
    await emitNotifications([mapped]);
    return mapped;
  }

  async function listNotificationsForUser(
    recipientUserId: string,
    input: Readonly<{ limit: number; unreadOnly: boolean }>,
  ): Promise<DashboardNotification[]> {
    const notifications = await repository.listForRecipient(recipientUserId, input);

    return notifications.map(mapNotification);
  }

  async function markNotificationRead(
    recipientUserId: string,
    notificationId: string,
  ): Promise<DashboardNotification> {
    const result = await repository.markRead(notificationId, recipientUserId);
    if (result.count === 0) throw new NotFoundError('The notification does not exist.');

    const notification = await repository.getNotification(notificationId);
    return mapNotification(notification);
  }
  return {
    userNotificationChannel,
    createChatMessageNotifications,
    createIncomingCallNotification,
    listNotificationsForUser,
    markNotificationRead,
  };
}
