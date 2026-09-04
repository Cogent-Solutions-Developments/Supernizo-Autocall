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
import type { Prisma } from '@generated/prisma/client';

import { getDatabaseClient } from '@/server/db/client';
import { ForbiddenError, NotFoundError } from '@/server/errors/app-error';
import { getEnvironmentReadiness } from '@/server/env';
import { UpstashRealtimeProvider } from '@/server/realtime';
import { createVisitorRealtimeToken } from '@/server/realtime/visitor-token';

import { resolveTrackingContext } from './tracker-engagement-service';

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

export function visitorOwnsChatThread(
  scope: Readonly<{ siteId: string; visitorId: string }> | null,
  context: Readonly<{ siteId: string; visitorId: string }>,
): boolean {
  return Boolean(scope && scope.siteId === context.siteId && scope.visitorId === context.visitorId);
}

const messageSelect = {
  agent: { select: { displayName: true } },
  content: true,
  id: true,
  senderType: true,
  sentAt: true,
  threadId: true,
} satisfies Prisma.ChatMessageSelect;

function mapMessage(
  message: Prisma.ChatMessageGetPayload<{ select: typeof messageSelect }>,
): ChatMessage {
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

async function assertChatEnabled(siteId: string): Promise<void> {
  const site = await getDatabaseClient().site.findUnique({
    where: { id: siteId },
    select: { chatEnabled: true, status: true },
  });

  if (!site) throw new NotFoundError('The requested site does not exist.');
  if (site.status !== 'ACTIVE' || !site.chatEnabled) {
    throw new ForbiddenError('Chat is not enabled for this site.');
  }
}

async function emitPersistedMessage(
  message: ChatMessage,
  scope: Readonly<{ siteId: string; visitorId: string }>,
): Promise<void> {
  if (!getEnvironmentReadiness().realtime) return;
  const realtime = new UpstashRealtimeProvider();
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

export async function getChatThreadScope(
  threadId: string,
): Promise<Readonly<{ siteId: string; visitorId: string }> | null> {
  return getDatabaseClient().chatThread.findUnique({
    where: { id: threadId },
    select: { siteId: true, visitorId: true },
  });
}

export async function listChatInboxThreads(
  siteId: string,
  limit: number,
): Promise<ChatInboxThread[]> {
  const threads = await getDatabaseClient().chatThread.findMany({
    where: { siteId, status: 'OPEN' },
    orderBy: [{ lastMessageAt: 'desc' }, { updatedAt: 'desc' }],
    select: {
      id: true,
      lastMessageAt: true,
      messages: {
        orderBy: [{ sentAt: 'desc' }, { id: 'desc' }],
        select: { content: true },
        take: 1,
      },
      siteId: true,
      visitor: {
        select: {
          identities: {
            orderBy: { linkedAt: 'desc' },
            select: { displayName: true },
            take: 1,
          },
        },
      },
      visitorId: true,
    },
    take: limit,
  });

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

export async function resolveOrCreateChatThread(
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
  const database = getDatabaseClient();
  const visitor = await database.visitor.findFirst({
    where: { id: visitorId, siteId },
    select: { id: true },
  });
  if (!visitor) throw new NotFoundError('The requested visitor does not exist.');

  const existing = await database.chatThread.findFirst({
    where: { siteId, status: 'OPEN', visitorId },
    orderBy: { updatedAt: 'desc' },
    select: { id: true, siteId: true, visitorId: true },
  });
  if (existing) return ChatThreadSchema.parse(existing);

  const thread = await database.chatThread.create({
    data: { assignedAgentId: agentId, siteId, visitorId },
    select: { id: true, siteId: true, visitorId: true },
  });
  return ChatThreadSchema.parse(thread);
}

export async function getChatHistory(
  threadId: string,
  input: unknown,
): Promise<ChatHistory | null> {
  const parsedInput = ChatHistoryQuerySchema.safeParse(input);
  if (!parsedInput.success) return null;

  const cursor = parseCursor(parsedInput.data.cursor);
  if (parsedInput.data.cursor && !cursor) return null;
  const where: Prisma.ChatMessageWhereInput = {
    threadId,
    ...(cursor
      ? {
          OR: [
            { sentAt: { lt: new Date(cursor.sentAt) } },
            { AND: [{ sentAt: { equals: new Date(cursor.sentAt) } }, { id: { lt: cursor.id } }] },
          ],
        }
      : {}),
  };
  const messages = await getDatabaseClient().chatMessage.findMany({
    where,
    orderBy: [{ sentAt: 'desc' }, { id: 'desc' }],
    select: messageSelect,
    take: parsedInput.data.limit + 1,
  });
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

export async function getVisitorChatThread(
  origin: string,
  context: TrackingContext,
  historyInput: ChatHistoryQuery,
): Promise<VisitorChatThread | null> {
  const resolvedContext = await resolveTrackingContext(context, origin);
  await assertChatEnabled(resolvedContext.siteId);
  const thread = await getDatabaseClient().chatThread.findFirst({
    where: { siteId: resolvedContext.siteId, status: 'OPEN', visitorId: resolvedContext.visitorId },
    orderBy: { updatedAt: 'desc' },
    select: { id: true, siteId: true, visitorId: true },
  });
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

export async function sendAgentChatMessage(
  threadId: string,
  agentId: string,
  content: string,
): Promise<ChatMessage> {
  const scope = await getChatThreadScope(threadId);
  if (!scope) throw new NotFoundError('The requested chat thread does not exist.');
  await assertChatEnabled(scope.siteId);

  const database = getDatabaseClient();
  const message = await database.$transaction(async (transaction) => {
    const created = await transaction.chatMessage.create({
      data: { agentId, content, senderType: 'AGENT', threadId },
      select: messageSelect,
    });
    await transaction.chatThread.update({
      where: { id: threadId },
      data: { assignedAgentId: agentId, lastMessageAt: created.sentAt },
    });
    return created;
  });

  const typedMessage = mapMessage(message);
  await emitPersistedMessage(typedMessage, scope);
  return typedMessage;
}

export async function sendVisitorChatMessage(
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

  const database = getDatabaseClient();
  const message = await database.$transaction(async (transaction) => {
    const created = await transaction.chatMessage.create({
      data: { content, senderType: 'VISITOR', threadId },
      select: messageSelect,
    });
    await transaction.chatThread.update({
      where: { id: threadId },
      data: { lastMessageAt: created.sentAt },
    });
    return created;
  });

  const typedMessage = mapMessage(message);
  await emitPersistedMessage(typedMessage, scope);
  return typedMessage;
}
