import 'server-only';
import { Prisma, type PrismaClient } from '@generated/prisma/client';
import { getDatabaseClient } from '@/server/infrastructure/db/client';
import type { ChatContactRepository } from '@/server/application/ports/chat-contact-repository';
const select = {
  contactChannel: true,
  contactEmail: true,
  contactWhatsApp: true,
  contactConsentAt: true,
  contactConsentVersion: true,
  followUpStatus: true,
  siteId: true,
  visitorId: true,
} satisfies Prisma.ChatThreadSelect;
export function createChatContactRepository(
  getClient: () => PrismaClient = getDatabaseClient,
): ChatContactRepository {
  return {
    getSite: (siteId) =>
      getClient().site.findUnique({
        where: { id: siteId },
        select: { status: true, chatEnabled: true },
      }),
    getThread: (id) => getClient().chatThread.findUnique({ where: { id }, select }),
    async hasSavedContact(scope) {
      const thread = await getClient().chatThread.findFirst({
        where: { siteId: scope.siteId, visitorId: scope.visitorId, status: 'OPEN' },
        orderBy: { updatedAt: 'desc' },
        select: { contactConsentAt: true },
      });
      return Boolean(thread?.contactConsentAt);
    },
    async listEligibleAgentIds() {
      const users = await getClient().user.findMany({
        where: {
          OR: [
            { globalRole: 'ADMIN', supernizoId: null, passwordHash: { not: null } },
            { supernizoState: { is: { eligibility: 'ELIGIBLE' } } },
          ],
        },
        select: { id: true },
      });
      return users.map((user) => user.id);
    },
    saveContact: (scope, requestedThreadId, contact) =>
      getClient().$transaction(async (database) => {
        await database.$executeRaw(
          Prisma.sql(
            ['SELECT pg_advisory_xact_lock(hashtextextended(', ', 0))'],
            'chat:' + scope.siteId + ':' + scope.visitorId,
          ),
        );
        const thread = await database.chatThread.findFirst({
          where: {
            siteId: scope.siteId,
            visitorId: scope.visitorId,
            ...(requestedThreadId ? { id: requestedThreadId } : { status: 'OPEN' }),
          },
          orderBy: { updatedAt: 'desc' },
          select: { id: true },
        });
        if (requestedThreadId && !thread) throw new Error('The chat is no longer available.');
        const saved = thread
          ? await database.chatThread.update({
              where: { id: thread.id },
              data: { ...contact, followUpStatus: 'NEEDS_REPLY' },
              select: { id: true },
            })
          : await database.chatThread.create({
              data: { ...scope, ...contact },
              select: { id: true },
            });
        return saved.id;
      }),
    async setStatus(id, followUpStatus) {
      await getClient().chatThread.update({ where: { id }, data: { followUpStatus } });
    },
  };
}
