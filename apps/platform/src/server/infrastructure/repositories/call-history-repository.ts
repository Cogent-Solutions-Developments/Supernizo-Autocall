import 'server-only';
import { Prisma, type PrismaClient } from '@generated/prisma/client';
import { getDatabaseClient } from '@/server/infrastructure/db/client';
import type {
  CallHistoryRepository,
  CallHistoryRepositorySession,
} from '@/server/application/ports/call-history-repository';

function bindRepository(getClient: () => Prisma.TransactionClient): CallHistoryRepositorySession {
  return {
    async listHistory(filters, requestedAt, siteId) {
      const database = getClient();
      return database.call.findMany({
        where: {
          ...(filters.agentId ? { agentId: filters.agentId } : {}),
          ...(Object.keys(requestedAt).length ? { requestedAt } : {}),
          ...(filters.status ? { status: filters.status } : {}),
          ...(filters.type ? { type: filters.type } : {}),
          siteId,
        },
        orderBy: [{ requestedAt: 'desc' }, { id: 'desc' }],
        select: {
          agent: { select: { displayName: true } },
          endedAt: true,
          failureCode: true,
          id: true,
          requestedAt: true,
          site: { select: { name: true } },
          siteId: true,
          startedAt: true,
          status: true,
          type: true,
          visitorId: true,
        },
        take: 100,
      });
    },
    async listVisitorHistory(siteId, visitorId) {
      const database = getClient();
      return database.call.findMany({
        where: { siteId, visitorId },
        orderBy: [{ requestedAt: 'desc' }, { id: 'desc' }],
        select: {
          agent: { select: { displayName: true } },
          endedAt: true,
          failureCode: true,
          id: true,
          requestedAt: true,
          site: { select: { name: true } },
          siteId: true,
          startedAt: true,
          status: true,
          type: true,
          visitorId: true,
        },
        take: 20,
      });
    },
    async listHistoricalAgents(siteId) {
      const database = getClient();
      return database.user.findMany({
        where: {
          // Historical participants remain filterable even after their access is revoked.
          requestedCalls: { some: { siteId } },
        },
        select: { displayName: true, email: true, id: true },
        orderBy: { email: 'asc' },
      });
    },
  };
}

export function createCallHistoryRepository(
  getClient: () => PrismaClient = getDatabaseClient,
): CallHistoryRepository {
  return { ...bindRepository(getClient) };
}
