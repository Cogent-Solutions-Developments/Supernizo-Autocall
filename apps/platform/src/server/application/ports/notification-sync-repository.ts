export type ListSyncPageResult = Array<{
  id: string;
  siteId: string;
  visitorId: string;
  type: 'CHAT_MESSAGE' | 'INCOMING_CALL';
  createdAt: Date;
  callId: null | string;
  siteName: string;
  threadId: null | string;
  messageId: null | string;
  visitorLabel: string;
  preview: string;
  recipient: { supernizoId: null | string };
}>;

export interface NotificationSyncRepositorySession {
  listSyncPage(
    cursor: null | { createdAt: string; id: string },
    input: { cursor: null | { createdAt: string; id: string }; limit: number; schemaVersion: 1 },
  ): Promise<ListSyncPageResult>;
}
export type NotificationSyncRepository = NotificationSyncRepositorySession;
