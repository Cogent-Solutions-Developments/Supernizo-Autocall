import 'server-only';
import { Prisma, type PrismaClient } from '@generated/prisma/client';
import { getDatabaseClient } from '@/server/infrastructure/db/client';
import type {
  ChatRepository,
  ChatRepositorySession,
} from '@/server/application/ports/chat-repository';
const messageSelect = {
  agent: { select: { displayName: true } },
  content: true,
  id: true,
  senderType: true,
  sentAt: true,
  threadId: true,
} satisfies Prisma.ChatMessageSelect;

function bindRepository(getClient: () => Prisma.TransactionClient): ChatRepositorySession {
  return {
    async getSiteChatSettings(siteId) {
      const database = getClient();
      return database.site.findUnique({
        where: { id: siteId },
        select: { chatEnabled: true, status: true },
      });
    },
    async getThreadScope(threadId) {
      const database = getClient();
      return database.chatThread.findUnique({
        where: { id: threadId },
        select: { siteId: true, visitorId: true },
      });
    },
    async listInbox(siteId, limit) {
      const database = getClient();
      return database.chatThread.findMany({
        where: { siteId, status: 'OPEN' },
        orderBy: [{ lastMessageAt: 'desc' }, { updatedAt: 'desc' }],
        select: {
          id: true,
          lastMessageAt: true,
          followUpStatus: true,
          contactConsentAt: true,
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
    },
    async findScopedVisitor(visitorId, siteId) {
      const database = getClient();
      return database.visitor.findFirst({
        where: { id: visitorId, siteId },
        select: { id: true },
      });
    },
    async findOpenThread(siteId, visitorId) {
      const database = getClient();
      return database.chatThread.findFirst({
        where: { siteId, status: 'OPEN', visitorId },
        orderBy: { updatedAt: 'desc' },
        select: { id: true, siteId: true, visitorId: true },
      });
    },
    async createThread(agentId, siteId, visitorId) {
      const database = getClient();
      return database.chatThread.create({
        data: { assignedAgentId: agentId, siteId, visitorId },
        select: { id: true, siteId: true, visitorId: true },
      });
    },
    async listMessages(threadId, cursor, limit) {
      const database = getClient();
      return database.chatMessage.findMany({
        where: {
          threadId,
          ...(cursor
            ? {
                OR: [
                  { sentAt: { lt: new Date(cursor.sentAt) } },
                  {
                    AND: [
                      { sentAt: { equals: new Date(cursor.sentAt) } },
                      { id: { lt: cursor.id } },
                    ],
                  },
                ],
              }
            : {}),
        },
        orderBy: [{ sentAt: 'desc' }, { id: 'desc' }],
        select: messageSelect,
        take: limit + 1,
      });
    },
    async findVisitorThread(resolvedContext) {
      const database = getClient();
      return database.chatThread.findFirst({
        where: {
          siteId: resolvedContext.siteId,
          status: 'OPEN',
          visitorId: resolvedContext.visitorId,
        },
        orderBy: { updatedAt: 'desc' },
        select: { id: true, siteId: true, visitorId: true },
      });
    },
    async findThreadForStart(context) {
      const database = getClient();
      await database.$executeRaw(
        Prisma.sql(
          ['SELECT pg_advisory_xact_lock(hashtextextended(', ', 0))'],
          'chat:' + context.siteId + ':' + context.visitorId,
        ),
      );
      return database.chatThread.findFirst({
        where: { siteId: context.siteId, status: 'OPEN', visitorId: context.visitorId },
        orderBy: { updatedAt: 'desc' },
        select: { id: true, siteId: true, visitorId: true },
      });
    },
    async createVisitorThread(context) {
      const database = getClient();
      return database.chatThread.create({
        data: {
          sessionId: context.sessionId,
          siteId: context.siteId,
          visitorId: context.visitorId,
        },
        select: { id: true, siteId: true, visitorId: true },
      });
    },
    async createOpeningMessage(content, thread) {
      const database = getClient();
      return database.chatMessage.create({
        data: { content, senderType: 'VISITOR', threadId: thread.id },
        select: messageSelect,
      });
    },
    async touchOpeningThread(thread, created) {
      const database = getClient();
      return database.chatThread.update({
        where: { id: thread.id },
        data: { lastMessageAt: created.sentAt, followUpStatus: 'NEEDS_REPLY' },
      });
    },
    async createAgentMessage(agentId, content, threadId) {
      const database = getClient();
      return database.chatMessage.create({
        data: { agentId, content, senderType: 'AGENT', threadId },
        select: messageSelect,
      });
    },
    async assignThread(threadId, agentId, created) {
      const database = getClient();
      return database.chatThread.update({
        where: { id: threadId },
        data: { assignedAgentId: agentId, lastMessageAt: created.sentAt },
      });
    },
    async createVisitorMessage(content, threadId) {
      const database = getClient();
      return database.chatMessage.create({
        data: { content, senderType: 'VISITOR', threadId },
        select: messageSelect,
      });
    },
    async touchThread(threadId, created) {
      const database = getClient();
      return database.chatThread.update({
        where: { id: threadId },
        data: { lastMessageAt: created.sentAt, followUpStatus: 'NEEDS_REPLY' },
      });
    },
  };
}
export function createChatRepository(
  getClient: () => PrismaClient = getDatabaseClient,
): ChatRepository {
  return {
    ...bindRepository(getClient),
    createThread: (agentId, siteId, visitorId) =>
      getClient().$transaction(async (database) => {
        await database.$executeRaw(
          Prisma.sql(
            ['SELECT pg_advisory_xact_lock(hashtextextended(', ', 0))'],
            'chat:' + siteId + ':' + visitorId,
          ),
        );
        const existing = await database.chatThread.findFirst({
          where: { siteId, visitorId, status: 'OPEN' },
          orderBy: { updatedAt: 'desc' },
          select: { id: true, siteId: true, visitorId: true },
        });
        return (
          existing ??
          database.chatThread.create({
            data: { assignedAgentId: agentId, siteId, visitorId },
            select: { id: true, siteId: true, visitorId: true },
          })
        );
      }),
    transaction: (work, options) =>
      getClient().$transaction((transaction) => work(bindRepository(() => transaction)), options),
  };
}
