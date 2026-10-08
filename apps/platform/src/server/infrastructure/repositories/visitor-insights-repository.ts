import 'server-only';
import { Prisma, type PrismaClient } from '@generated/prisma/client';
import { getDatabaseClient } from '@/server/infrastructure/db/client';
import type {
  VisitorInsightsRepository,
  VisitorInsightsRepositorySession,
} from '@/server/application/ports/visitor-insights-repository';
import type { TimelineCursorValue } from '@/server/domain/visitors/visitor-insights';

function cursorFilter(
  field: 'createdAt' | 'enteredAt',
  cursor: TimelineCursorValue | null,
  kind: TimelineCursorValue['kind'],
): Prisma.PageViewWhereInput | Prisma.VisitorEventWhereInput {
  if (!cursor) return {};

  const cursorDate = new Date(cursor.occurredAt);
  const fieldFilter = (value: Prisma.DateTimeFilter) => ({ [field]: value });

  if (kind === 'page_view') {
    if (cursor.kind === 'event') {
      return { OR: [fieldFilter({ lt: cursorDate }), fieldFilter({ equals: cursorDate })] };
    }

    return {
      OR: [
        fieldFilter({ lt: cursorDate }),
        { AND: [fieldFilter({ equals: cursorDate }), { id: { lt: cursor.id } }] },
      ],
    };
  }

  if (cursor.kind === 'event') {
    return {
      OR: [
        fieldFilter({ lt: cursorDate }),
        { AND: [fieldFilter({ equals: cursorDate }), { id: { lt: cursor.id } }] },
      ],
    };
  }

  return { OR: [fieldFilter({ lt: cursorDate })] };
}
function bindRepository(
  getClient: () => Prisma.TransactionClient,
): VisitorInsightsRepositorySession {
  return {
    async findVisitor(visitorId, siteId) {
      const database = getClient();
      return database.visitor.findFirst({
        where: { id: visitorId, siteId },
        select: {
          _count: { select: { chatThreads: true, sessions: true } },
          chatThreads: { orderBy: { updatedAt: 'desc' }, select: { id: true }, take: 1 },
          firstSeenAt: true,
          identities: {
            orderBy: { linkedAt: 'desc' },
            select: { displayName: true, email: true, provider: true },
            take: 5,
          },
          lastSeenAt: true,
        },
      });
    },
    async listSessions(siteId, visitorId) {
      const database = getClient();
      return database.session.findMany({
        where: { siteId, visitorId },
        orderBy: { lastSeenAt: 'desc' },
        select: {
          activeDurationSeconds: true,
          browserName: true,
          currentUrl: true,
          deviceType: true,
          endedAt: true,
          geoCity: true,
          geoCountry: true,
          id: true,
          lastSeenAt: true,
          startedAt: true,
          utmCampaign: true,
          utmMedium: true,
          utmSource: true,
          referrerUrl: true,
        },
        take: 6,
      });
    },
    async listPageViews(siteId, visitorId, cursor, limit) {
      const database = getClient();
      return database.pageView.findMany({
        where: {
          AND: [
            { session: { is: { siteId, visitorId } } },
            cursorFilter('enteredAt', cursor, 'page_view') as Prisma.PageViewWhereInput,
          ],
        },
        orderBy: [{ enteredAt: 'desc' }, { id: 'desc' }],
        select: {
          activeDurationSeconds: true,
          enteredAt: true,
          id: true,
          maxScrollPercent: true,
          path: true,
          title: true,
        },
        take: limit + 1,
      });
    },
    async listEvents(siteId, visitorId, cursor, limit) {
      const database = getClient();
      return database.visitorEvent.findMany({
        where: {
          AND: [
            { siteId, visitorId },
            cursorFilter('createdAt', cursor, 'event') as Prisma.VisitorEventWhereInput,
          ],
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        select: { createdAt: true, id: true, name: true, type: true },
        take: limit + 1,
      });
    },
    async groupVisitors(period, siteId) {
      const database = getClient();
      const result = await database.session.groupBy({
        by: ['visitorId'],
        where: {
          lastSeenAt: { gte: period.from, lt: period.toExclusive },
          siteId,
        },
      });
      return result;
    },
    async averageSessionActivity(period, siteId) {
      const database = getClient();
      return database.session.aggregate({
        _avg: { activeDurationSeconds: true },
        where: {
          lastSeenAt: { gte: period.from, lt: period.toExclusive },
          siteId,
        },
      });
    },
    async topLandingPages(period, siteId) {
      const database = getClient();
      const result = await database.pageView.groupBy({
        _count: { path: true },
        by: ['path'],
        orderBy: { _count: { path: 'desc' } },
        take: 5,
        where: {
          enteredAt: { gte: period.from, lt: period.toExclusive },
          session: { is: { siteId } },
        },
      });
      return result;
    },
    async topActivePages(period, siteId) {
      const database = getClient();
      const result = await database.pageView.groupBy({
        _sum: { activeDurationSeconds: true },
        by: ['path'],
        orderBy: { _sum: { activeDurationSeconds: 'desc' } },
        take: 5,
        where: {
          enteredAt: { gte: period.from, lt: period.toExclusive },
          session: { is: { siteId } },
        },
      });
      return result;
    },
    async topReferrers(period, siteId) {
      const database = getClient();
      const result = await database.session.groupBy({
        _count: { referrerUrl: true },
        by: ['referrerUrl'],
        orderBy: { _count: { referrerUrl: 'desc' } },
        take: 5,
        where: {
          ...{
            lastSeenAt: { gte: period.from, lt: period.toExclusive },
            siteId,
          },
          referrerUrl: { not: null },
        },
      });
      return result;
    },
    async topCampaigns(period, siteId) {
      const database = getClient();
      const result = await database.session.groupBy({
        _count: { utmCampaign: true },
        by: ['utmCampaign'],
        orderBy: { _count: { utmCampaign: 'desc' } },
        take: 5,
        where: {
          ...{
            lastSeenAt: { gte: period.from, lt: period.toExclusive },
            siteId,
          },
          utmCampaign: { not: null },
        },
      });
      return result;
    },
    async countryDistribution(period, siteId) {
      const database = getClient();
      const result = await database.session.groupBy({
        _count: { geoCountry: true },
        by: ['geoCountry'],
        orderBy: { _count: { geoCountry: 'desc' } },
        take: 10,
        where: {
          ...{
            lastSeenAt: { gte: period.from, lt: period.toExclusive },
            siteId,
          },
          geoCountry: { not: null },
        },
      });
      return result;
    },
    async topEvents(period, siteId) {
      const database = getClient();
      const result = await database.visitorEvent.groupBy({
        _count: { id: true },
        by: ['type', 'name'],
        orderBy: { _count: { id: 'desc' } },
        take: 10,
        where: {
          createdAt: { gte: period.from, lt: period.toExclusive },
          siteId,
          type: { in: ['cta_click', 'custom'] },
        },
      });
      return result;
    },
    async countNewVisitors(period, visitorIds, siteId) {
      const database = getClient();
      return database.visitor.count({
        where: {
          firstSeenAt: { gte: period.from, lt: period.toExclusive },
          id: { in: visitorIds },
          siteId,
        },
      });
    },
  };
}

export function createVisitorInsightsRepository(
  getClient: () => PrismaClient = getDatabaseClient,
): VisitorInsightsRepository {
  return { ...bindRepository(getClient) };
}
