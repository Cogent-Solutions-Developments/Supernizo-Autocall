import 'server-only';
import { createNotificationService } from '@/server/application/notifications/notification-service';
import { runtimeProviders } from '@/server/composition/runtime-providers';
import { createNotificationRepository } from '@/server/infrastructure/repositories/notification-repository';
export * from '@/server/application/notifications/notification-service';
const service = createNotificationService({
  ...runtimeProviders,
  repository: createNotificationRepository(),
});
export const {
  userNotificationChannel,
  createChatMessageNotifications,
  createIncomingCallNotification,
  listNotificationsForUser,
  markNotificationRead,
} = service;
