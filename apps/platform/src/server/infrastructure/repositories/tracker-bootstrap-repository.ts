import 'server-only';
import { Prisma, type PrismaClient } from '@generated/prisma/client';
import { getDatabaseClient } from '@/server/infrastructure/db/client';
import type {
  TrackerBootstrapRepository,
  TrackerBootstrapRepositorySession,
} from '@/server/application/ports/tracker-bootstrap-repository';

function bindRepository(
  getClient: () => Prisma.TransactionClient,
): TrackerBootstrapRepositorySession {
  return {
    async findSite(payload) {
      const database = getClient();
      return database.site.findUnique({
        where: { publicKey: payload.sitePublicKey },
      });
    },
    async upsertVisitor(payload, now, site) {
      const database = getClient();
      return database.visitor.upsert({
        create: {
          anonymousId: payload.visitorId,
          firstSeenAt: now,
          lastSeenAt: now,
          siteId: site.id,
        },
        update: { lastSeenAt: now },
        where: {
          siteId_anonymousId: {
            anonymousId: payload.visitorId,
            siteId: site.id,
          },
        },
      });
    },
    async findSession(payload) {
      const database = getClient();
      return database.session.findUnique({
        where: { anonymousSessionId: payload.sessionId },
      });
    },
    async upsertSession(payload, now, site, visitor, sessionDetails) {
      const database = getClient();
      return database.session.upsert({
        create: {
          anonymousSessionId: payload.sessionId,
          lastSeenAt: now,
          siteId: site.id,
          startedAt: now,
          visitorId: visitor.id,
          ...sessionDetails,
        },
        update: {
          lastSeenAt: now,
          ...sessionDetails,
        },
        where: { anonymousSessionId: payload.sessionId },
      });
    },
  };
}

export function createTrackerBootstrapRepository(
  getClient: () => PrismaClient = getDatabaseClient,
): TrackerBootstrapRepository {
  return { ...bindRepository(getClient) };
}
