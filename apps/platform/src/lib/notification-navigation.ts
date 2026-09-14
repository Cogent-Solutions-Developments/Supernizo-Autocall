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
