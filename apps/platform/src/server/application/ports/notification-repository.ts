import type { CallType } from '@supernizo/shared';
export type GetVisitorLabelResult = null | { identities: Array<{ displayName: null | string }> };

export type CreateMessageNotificationsResult = Array<{
  id: string;
  siteId: string;
  visitorId: string;
  type: 'CHAT_MESSAGE' | 'INCOMING_CALL';
  createdAt: Date;
  callId: null | string;
  siteName: string;
  threadId: null | string;
  recipientUserId: string;
  messageId: null | string;
  visitorLabel: string;
  preview: string;
  readAt: null | Date;
}>;

export type UpsertIncomingCallResult = {
  id: string;
  siteId: string;
  visitorId: string;
  type: 'CHAT_MESSAGE' | 'INCOMING_CALL';
  createdAt: Date;
  callId: null | string;
  siteName: string;
  threadId: null | string;
  recipientUserId: string;
  messageId: null | string;
  visitorLabel: string;
  preview: string;
  readAt: null | Date;
};

export interface NotificationRepositorySession {
  getSiteName(scope: { siteId: string; visitorId: string }): Promise<null | { name: string }>;
  getVisitorLabel(scope: { siteId: string; visitorId: string }): Promise<GetVisitorLabelResult>;
  listRecipients(): Promise<Array<{ id: string }>>;
  createMessageNotifications(
    recipients: Array<{ id: string }>,
    message: {
      content: string;
      id: string;
      senderName: null | string;
      senderType: 'AGENT' | 'VISITOR' | 'SYSTEM';
      sentAt: string;
      threadId: string;
    },
    preview: string,
    scope: { siteId: string; visitorId: string },
    site: { name: string },
    visitorLabel: string,
  ): Promise<CreateMessageNotificationsResult>;
  upsertIncomingCall(input: {
    callId: string;
    recipientUserId: string;
    siteId: string;
    siteName: string;
    visitorId: string;
    visitorLabel: string;
    type: CallType;
  }): Promise<UpsertIncomingCallResult>;
  listForRecipient(
    recipientUserId: string,
    input: { limit: number; unreadOnly: boolean },
  ): Promise<CreateMessageNotificationsResult>;
  markRead(notificationId: string, recipientUserId: string): Promise<{ count: number }>;
  getNotification(notificationId: string): Promise<UpsertIncomingCallResult>;
}
export type NotificationRepository = NotificationRepositorySession;
