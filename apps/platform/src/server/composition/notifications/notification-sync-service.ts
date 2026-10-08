import 'server-only';
import { createNotificationSyncService } from '@/server/application/notifications/notification-sync-service';
import { createNotificationSyncRepository } from '@/server/infrastructure/repositories/notification-sync-repository';
export * from '@/server/application/notifications/notification-sync-service';
const service = createNotificationSyncService({ repository: createNotificationSyncRepository() });
export const { listNotificationSyncPage } = service;
