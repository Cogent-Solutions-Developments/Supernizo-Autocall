import type { DashboardNotification } from '@supernizo/shared';

export function mergeDashboardNotification(
  current: readonly DashboardNotification[],
  incoming: DashboardNotification,
  limit = 50,
): DashboardNotification[] {
  return [incoming, ...current.filter((notification) => notification.id !== incoming.id)]
    .sort(
      (left, right) =>
        right.createdAt.localeCompare(left.createdAt) || right.id.localeCompare(left.id),
    )
    .slice(0, limit);
}

export function markDashboardNotificationRead(
  current: readonly DashboardNotification[],
  notificationId: string,
  readAt: string,
): DashboardNotification[] {
  return current.map((notification) =>
    notification.id === notificationId ? { ...notification, readAt } : notification,
  );
}

export function unreadNotificationCount(notifications: readonly DashboardNotification[]): number {
  return notifications.filter((notification) => notification.readAt === null).length;
}
