type NotificationConversation = Readonly<{
  siteId: string;
  threadId: string;
  visitorId: string;
}>;

export function visitorChatHref({
  siteId,
  threadId,
  visitorId,
}: NotificationConversation): string {
  const query = new URLSearchParams({ siteId, threadId });
  return `/dashboard/visitors/${encodeURIComponent(visitorId)}?${query.toString()}`;
}

export function dashboardNotificationHref(notification: Readonly<{
  callId: string | null;
  siteId: string;
  threadId: string | null;
  type: string;
  visitorId: string;
}>): string {
  if (notification.type === 'INCOMING_CALL' && notification.callId) {
    return `/dashboard/calls/${encodeURIComponent(notification.callId)}`;
  }
  if (!notification.threadId) return '/dashboard';
  return visitorChatHref({ ...notification, threadId: notification.threadId });
}
