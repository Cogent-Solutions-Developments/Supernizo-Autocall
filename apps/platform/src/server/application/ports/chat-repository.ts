import type { AgentProfileRecord } from '@supernizo/shared';
export type GetSiteChatSettingsResult = null | {
  status: 'ACTIVE' | 'INACTIVE';
  chatEnabled: boolean;
};

export type ListInboxResult = Array<{
  id: string;
  siteId: string;
  visitorId: string;
  visitor: { identities: Array<{ displayName: null | string }> };
  followUpStatus: 'NEEDS_REPLY' | 'FOLLOW_UP_PENDING' | 'RESOLVED';
  contactConsentAt: Date | null;
  lastMessageAt: null | Date;
  messages: Array<{ content: string }>;
}>;

export type FindOpenThreadResult = null | { id: string; siteId: string; visitorId: string };

export type CreateThreadResult = { id: string; siteId: string; visitorId: string };

export type ListMessagesResult = Array<{
  id: string;
  agent: AgentProfileRecord | null;
  sentAt: Date;
  threadId: string;
  senderType: 'AGENT' | 'VISITOR' | 'SYSTEM';
  content: string;
}>;

export type CreateOpeningMessageResult = {
  id: string;
  agent: AgentProfileRecord | null;
  sentAt: Date;
  threadId: string;
  senderType: 'AGENT' | 'VISITOR' | 'SYSTEM';
  content: string;
};

export type TouchOpeningThreadResult = {
  id: string;
  siteId: string;
  visitorId: string;
  sessionId: null | string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  assignedAgentId: null | string;
  lastMessageAt: null | Date;
};

export interface ChatRepositorySession {
  getSiteChatSettings(siteId: string): Promise<GetSiteChatSettingsResult>;
  getThreadScope(threadId: string): Promise<null | { siteId: string; visitorId: string }>;
  listInbox(siteId: string, limit: number): Promise<ListInboxResult>;
  findScopedVisitor(visitorId: string, siteId: string): Promise<null | { id: string }>;
  findOpenThread(siteId: string, visitorId: string): Promise<FindOpenThreadResult>;
  createThread(agentId: string, siteId: string, visitorId: string): Promise<CreateThreadResult>;
  listMessages(
    threadId: string,
    cursor: null | { id: string; sentAt: string },
    limit: number,
  ): Promise<ListMessagesResult>;
  findVisitorThread(resolvedContext: {
    sessionId: string;
    siteId: string;
    visitorId: string;
  }): Promise<FindOpenThreadResult>;
  findThreadForStart(context: {
    sessionId: string;
    siteId: string;
    visitorId: string;
  }): Promise<FindOpenThreadResult>;
  createVisitorThread(context: {
    sessionId: string;
    siteId: string;
    visitorId: string;
  }): Promise<CreateThreadResult>;
  createOpeningMessage(
    content: string,
    thread: { id: string; siteId: string; visitorId: string },
  ): Promise<CreateOpeningMessageResult>;
  touchOpeningThread(
    thread: { id: string; siteId: string; visitorId: string },
    created: {
      id: string;
      agent: AgentProfileRecord | null;
      sentAt: Date;
      threadId: string;
      senderType: 'AGENT' | 'VISITOR' | 'SYSTEM';
      content: string;
    },
  ): Promise<TouchOpeningThreadResult>;
  createAgentMessage(
    agentId: string,
    content: string,
    threadId: string,
  ): Promise<CreateOpeningMessageResult>;
  assignThread(
    threadId: string,
    agentId: string,
    created: {
      id: string;
      agent: AgentProfileRecord | null;
      sentAt: Date;
      threadId: string;
      senderType: 'AGENT' | 'VISITOR' | 'SYSTEM';
      content: string;
    },
  ): Promise<TouchOpeningThreadResult>;
  createVisitorMessage(content: string, threadId: string): Promise<CreateOpeningMessageResult>;
  touchThread(
    threadId: string,
    created: {
      id: string;
      agent: AgentProfileRecord | null;
      sentAt: Date;
      threadId: string;
      senderType: 'AGENT' | 'VISITOR' | 'SYSTEM';
      content: string;
    },
  ): Promise<TouchOpeningThreadResult>;
}
export interface ChatRepository extends ChatRepositorySession {
  transaction<T>(
    work: (transaction: ChatRepositorySession) => Promise<T>,
    options?: { maxWait?: number; timeout?: number },
  ): Promise<T>;
}
