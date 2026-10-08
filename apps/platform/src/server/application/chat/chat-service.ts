import type { ChatRepository } from '@/server/application/ports/chat-repository';
import 'server-only';
import { Buffer } from 'node:buffer';
import {
  ChatHistoryQuerySchema,
  ChatInboxThreadSchema,
  ChatMessageSchema,
  ChatThreadSchema,
  type ChatHistoryQuery,
  type ChatInboxThread,
  type ChatMessage,
  type ChatThread,
  type TrackingContext,
} from '@supernizo/shared';
import { ForbiddenError, NotFoundError } from '@/server/domain/errors/app-error';
import type { RuntimeProviders } from '@/server/application/ports/runtime-providers';
import type { createNotificationService } from '../notifications/notification-service';
import type { createTrackerEngagementService } from '../tracking/tracker-engagement-service';
type ChatHistoryCursor = Readonly<{ id: string; sentAt: string }>;

export type ChatHistory = Readonly<{
  messages: ChatMessage[];
  nextCursor: string | null;
}>;

export type VisitorChatThread = Readonly<{
  history: ChatHistory;
  realtime: Readonly<{ channel: string; token: string }>;
  thread: ChatThread;
}>;

type VisitorChatStart = Readonly<{
  message: ChatMessage;
  thread: ChatThread;
}>;
export function createChatService(
  dependencies: Pick<
    RuntimeProviders,
    'getEnvironmentReadiness' | 'getRealtimeProvider' | 'createVisitorRealtimeToken'
  > & {
    repository: ChatRepository;
    createChatMessageNotifications: ReturnType<
      typeof createNotificationService
    >['createChatMessageNotifications'];
    resolveTrackingContext: ReturnType<
      typeof createTrackerEngagementService
    >['resolveTrackingContext'];
  },
) {
  const {
    repository,
    getEnvironmentReadiness,
    getRealtimeProvider,
    createVisitorRealtimeToken,
    createChatMessageNotifications,
    resolveTrackingContext,
  } = dependencies;
  function visitorOwnsChatThread(
    scope: Readonly<{ siteId: string; visitorId: string }> | null,
    context: Readonly<{ siteId: string; visitorId: string }>,
  ): boolean {
    return Boolean(
      scope && scope.siteId === context.siteId && scope.visitorId === context.visitorId,
    );
  }

  function mapMessage(message: {
    id: string;
    agent: null | { displayName: null | string };
    sentAt: Date;
    threadId: string;
    senderType: 'AGENT' | 'VISITOR' | 'SYSTEM';
    content: string;
  }): ChatMessage {
    return ChatMessageSchema.parse({
      content: message.content,
      id: message.id,
      senderName:
        message.senderType === 'AGENT' ? (message.agent?.displayName ?? 'Support team') : 'Visitor',
      senderType: message.senderType,
      sentAt: message.sentAt.toISOString(),
      threadId: message.threadId,
    });
  }

  function encodeCursor(cursor: ChatHistoryCursor): string {
    return Buffer.from(JSON.stringify(cursor)).toString('base64url');
  }

  function parseCursor(cursor: string | undefined): ChatHistoryCursor | null {
    if (!cursor) return null;

    try {
      const candidate: unknown = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
      if (
        !candidate ||
        typeof candidate !== 'object' ||
        !('id' in candidate) ||
        !('sentAt' in candidate) ||
        typeof candidate.id !== 'string' ||
        typeof candidate.sentAt !== 'string' ||
        Number.isNaN(Date.parse(candidate.sentAt))
      ) {
        return null;
      }

      return { id: candidate.id, sentAt: candidate.sentAt };
    } catch {
      return null;
    }
  }

  function chatChannel(threadId: string): string {
    return `chat:${threadId}`;
  }

  const openingThreads = new Map<string, Promise<ChatThread>>();

  const visitorOpeningThreads = new Map<string, Promise<VisitorChatStart>>();

  async function assertChatEnabled(siteId: string): Promise<void> {
    const site = await repository.getSiteChatSettings(siteId);

    if (!site) throw new NotFoundError('The requested site does not exist.');
    if (site.status !== 'ACTIVE' || !site.chatEnabled) {
      throw new ForbiddenError('Chat is not enabled for this site.');
    }
  }

  async function emitPersistedMessage(
    message: ChatMessage,
    scope: Readonly<{ siteId: string; visitorId: string }>,
  ): Promise<void> {
    if (message.senderType === 'VISITOR') {
      try {
        await createChatMessageNotifications(message, scope);
      } catch (error: unknown) {
        console.error('Chat notification persistence failed.', {
          errorName: error instanceof Error ? error.name : 'UnknownError',
        });
      }
    }

    if (!getEnvironmentReadiness().realtime) return;
    const realtime = getRealtimeProvider();
    await realtime.emitToChannel(chatChannel(message.threadId), {
      type: 'chat.message',
      message,
    });

    if (message.senderType === 'VISITOR') {
      await realtime.emitToChannel(`site:${scope.siteId}`, {
        type: 'chat.incoming',
        message,
        visitorId: scope.visitorId,
      });
    }
  }

  async function getChatThreadScope(
    threadId: string,
  ): Promise<Readonly<{ siteId: string; visitorId: string }> | null> {
    return repository.getThreadScope(threadId);
  }

  async function chatThreadBelongsToVisitor(
    threadId: string,
    siteId: string,
    visitorId: string,
  ): Promise<boolean> {
    const scope = await getChatThreadScope(threadId);
    return scope?.siteId === siteId && scope?.visitorId === visitorId;
  }

  async function listChatInboxThreads(siteId: string, limit: number): Promise<ChatInboxThread[]> {
    const threads = await repository.listInbox(siteId, limit);

    return threads.map((thread) =>
      ChatInboxThreadSchema.parse({
        id: thread.id,
        lastMessageAt: thread.lastMessageAt?.toISOString() ?? null,
        lastMessagePreview: thread.messages[0]?.content ?? null,
        siteId: thread.siteId,
        visitorId: thread.visitorId,
        visitorLabel:
          thread.visitor.identities[0]?.displayName?.trim() ||
          `Visitor #${thread.visitorId.slice(-6)}`,
      }),
    );
  }

  async function resolveOrCreateChatThread(
    siteId: string,
    visitorId: string,
    agentId: string,
  ): Promise<ChatThread> {
    const threadKey = `${siteId}:${visitorId}`;
    const pendingThread = openingThreads.get(threadKey);
    if (pendingThread) return pendingThread;

    const operation = resolveOrCreateChatThreadOnce(siteId, visitorId, agentId);
    openingThreads.set(threadKey, operation);

    try {
      return await operation;
    } finally {
      if (openingThreads.get(threadKey) === operation) {
        openingThreads.delete(threadKey);
      }
    }
  }

  async function resolveOrCreateChatThreadOnce(
    siteId: string,
    visitorId: string,
    agentId: string,
  ): Promise<ChatThread> {
    await assertChatEnabled(siteId);
    const visitor = await repository.findScopedVisitor(visitorId, siteId);
    if (!visitor) throw new NotFoundError('The requested visitor does not exist.');

    const existing = await repository.findOpenThread(siteId, visitorId);
    if (existing) return ChatThreadSchema.parse(existing);

    const thread = await repository.createThread(agentId, siteId, visitorId);
    return ChatThreadSchema.parse(thread);
  }

  async function getChatHistory(threadId: string, input: unknown): Promise<ChatHistory | null> {
    const parsedInput = ChatHistoryQuerySchema.safeParse(input);
    if (!parsedInput.success) return null;

    const cursor = parseCursor(parsedInput.data.cursor);
    if (parsedInput.data.cursor && !cursor) return null;

    const messages = await repository.listMessages(threadId, cursor, parsedInput.data.limit);
    const page = messages.slice(0, parsedInput.data.limit);
    const last = page.at(-1);

    return {
      messages: page.map(mapMessage).reverse(),
      nextCursor:
        messages.length > parsedInput.data.limit && last
          ? encodeCursor({ id: last.id, sentAt: last.sentAt.toISOString() })
          : null,
    };
  }

  async function getVisitorChatThread(
    origin: string,
    context: TrackingContext,
    historyInput: ChatHistoryQuery,
  ): Promise<VisitorChatThread | null> {
    const resolvedContext = await resolveTrackingContext(context, origin);
    await assertChatEnabled(resolvedContext.siteId);
    const thread = await repository.findVisitorThread(resolvedContext);
    if (!thread) return null;

    const typedThread = ChatThreadSchema.parse(thread);
    const history = await getChatHistory(typedThread.id, historyInput);
    if (!history) return null;

    const channel = chatChannel(typedThread.id);
    return {
      history,
      realtime: { channel, token: createVisitorRealtimeToken(channel) },
      thread: typedThread,
    };
  }

  async function startVisitorChat(
    origin: string,
    context: TrackingContext,
    content: string,
  ): Promise<VisitorChatThread> {
    const resolvedContext = await resolveTrackingContext(context, origin);
    await assertChatEnabled(resolvedContext.siteId);

    const threadKey = `${resolvedContext.siteId}:${resolvedContext.visitorId}`;
    const pendingStart = visitorOpeningThreads.get(threadKey);
    if (pendingStart) {
      const started = await pendingStart;
      return getStartedVisitorChatThread(started);
    }

    const operation = startVisitorChatOnce(resolvedContext, content);
    visitorOpeningThreads.set(threadKey, operation);

    try {
      const started = await operation;
      await emitPersistedMessage(started.message, started.thread);
      return getStartedVisitorChatThread(started);
    } finally {
      if (visitorOpeningThreads.get(threadKey) === operation) {
        visitorOpeningThreads.delete(threadKey);
      }
    }
  }

  async function startVisitorChatOnce(
    context: Readonly<{ sessionId: string; siteId: string; visitorId: string }>,
    content: string,
  ): Promise<VisitorChatStart> {
    return repository.transaction(async (transaction) => {
      const existing = await transaction.findThreadForStart(context);
      const thread = existing ?? (await transaction.createVisitorThread(context));
      const created = await transaction.createOpeningMessage(content, thread);
      await transaction.touchOpeningThread(thread, created);
      return { message: mapMessage(created), thread: ChatThreadSchema.parse(thread) };
    });
  }

  async function getStartedVisitorChatThread(
    started: VisitorChatStart,
  ): Promise<VisitorChatThread> {
    const history = await getChatHistory(started.thread.id, { limit: 50 });
    const channel = chatChannel(started.thread.id);
    return {
      history: history ?? { messages: [started.message], nextCursor: null },
      realtime: { channel, token: createVisitorRealtimeToken(channel) },
      thread: started.thread,
    };
  }

  async function sendAgentChatMessage(
    threadId: string,
    agentId: string,
    content: string,
  ): Promise<ChatMessage> {
    const scope = await getChatThreadScope(threadId);
    if (!scope) throw new NotFoundError('The requested chat thread does not exist.');
    await assertChatEnabled(scope.siteId);

    const message = await repository.transaction(async (transaction) => {
      const created = await transaction.createAgentMessage(agentId, content, threadId);
      await transaction.assignThread(threadId, agentId, created);
      return created;
    });

    const typedMessage = mapMessage(message);
    await emitPersistedMessage(typedMessage, scope);
    return typedMessage;
  }

  async function sendVisitorChatMessage(
    threadId: string,
    origin: string,
    context: TrackingContext,
    content: string,
  ): Promise<ChatMessage> {
    const resolvedContext = await resolveTrackingContext(context, origin);
    const scope = await getChatThreadScope(threadId);
    if (!scope || !visitorOwnsChatThread(scope, resolvedContext)) {
      throw new ForbiddenError('The requested chat thread is not available to this visitor.');
    }
    await assertChatEnabled(scope.siteId);

    const message = await repository.transaction(async (transaction) => {
      const created = await transaction.createVisitorMessage(content, threadId);
      await transaction.touchThread(threadId, created);
      return created;
    });

    const typedMessage = mapMessage(message);
    await emitPersistedMessage(typedMessage, scope);
    return typedMessage;
  }
  return {
    visitorOwnsChatThread,
    getChatThreadScope,
    chatThreadBelongsToVisitor,
    listChatInboxThreads,
    resolveOrCreateChatThread,
    getChatHistory,
    getVisitorChatThread,
    startVisitorChat,
    sendAgentChatMessage,
    sendVisitorChatMessage,
  };
}
