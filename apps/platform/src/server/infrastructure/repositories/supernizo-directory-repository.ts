import 'server-only';
import { Prisma, type PrismaClient } from '@generated/prisma/client';
import { getDatabaseClient } from '@/server/infrastructure/db/client';
import type {
  SupernizoDirectoryRepository,
  SupernizoDirectoryRepositorySession,
} from '@/server/application/ports/supernizo-directory-repository';

function bindRepository(
  getClient: () => Prisma.TransactionClient,
): SupernizoDirectoryRepositorySession {
  return {
    getEligibility: (userId) =>
      getClient().supernizoUserState.findUniqueOrThrow({ where: { userId } }),
    listAccounts: (cursor) =>
      getClient().user.findMany({
        where: { supernizoId: { not: null } },
        orderBy: { id: 'asc' },
        take: 100,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        select: { id: true, supernizoId: true },
      }),
    async findDirectoryUser(state) {
      const database = getClient();
      return database.user.findUnique({
        where: { supernizoId: state.subject },
        include: { supernizoState: true },
      });
    },
    async findConflictingAccount(state) {
      const database = getClient();
      return database.user.findUnique({
        where: { email: `${state.subject}@supernizo.invalid` },
        select: { id: true },
      });
    },
    async saveDirectoryUser(state) {
      const database = getClient();
      return database.user.upsert({
        where: { supernizoId: state.subject },
        create: {
          supernizoId: state.subject,
          email: `${state.subject}@supernizo.invalid`,
          displayName: state.user.displayName,
          globalRole: state.user.role,
        },
        update: { displayName: state.user.displayName, globalRole: state.user.role },
      });
    },
    async saveDirectoryState(user, data) {
      const database = getClient();
      return database.supernizoUserState.upsert({
        where: { userId: user.id },
        create: { userId: user.id, ...data },
        update: data,
      });
    },
    async recordSynchronization(user, state) {
      const database = getClient();
      return database.auditLog.create({
        data: {
          action: 'user.directory.synchronized',
          entityType: 'User',
          entityId: user.id,
          metadata: {
            subject: state.subject,
            revision: state.directoryRevision,
            eligibility: state.user.eligibility,
            role: state.user.role,
          },
        },
      });
    },
    async findReceipt(event) {
      const database = getClient();
      return database.integrationInbox.findUnique({
        where: { eventId: event.eventId },
      });
    },
    async saveReceipt(event, payloadHash) {
      const database = getClient();
      return database.integrationInbox.create({
        data: { eventId: event.eventId, subject: event.subject, payloadHash },
      });
    },
    async lockUser(subject) {
      await getClient()
        .$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`supernizo:${subject}`}, 0))::text`;
    },
    async lockEvent(eventId) {
      await getClient()
        .$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`supernizo-event:${eventId}`}, 0))::text`;
    },
    async pruneReceipts() {
      await getClient()
        .$executeRaw`DELETE FROM "IntegrationInbox" WHERE "eventId" IN (SELECT "eventId" FROM "IntegrationInbox" WHERE "processedAt" < now() - interval '30 days' LIMIT 100)`;
    },
  };
}

export function createSupernizoDirectoryRepository(
  getClient: () => PrismaClient = getDatabaseClient,
): SupernizoDirectoryRepository {
  return {
    ...bindRepository(getClient),
    transaction: (work, options) =>
      getClient().$transaction((transaction) => work(bindRepository(() => transaction)), options),
  };
}
