import 'server-only';

import { z } from 'zod';

import {
  DashboardDateRangeSchema,
  IdSchema,
  PaginationSchema,
  UtcDateTimeSchema,
  type DashboardDateRange,
} from '@supernizo/shared';
import type { Prisma } from '@generated/prisma/client';

import { getDatabaseClient } from '@/server/db/client';

import {
  buildVisitorMetrics,
  mergeTimelineEntries,
  type TimelineCursorValue,
  type VisitorTimelineEntry,
} from './visitor-insights';

const TimelineCursorSchema = z.object({
  id: IdSchema,
  kind: z.enum(['event', 'page_view']),
  occurredAt: UtcDateTimeSchema,
});

const VisitorTimelineInputSchema = PaginationSchema;

export type VisitorProfile = Readonly<{
  attribution: Readonly<{
    campaign: string | null;
    medium: string | null;
    referrer: string | null;
    source: string | null;
  }>;
  chatThreadCount: number;
  latestChatThreadId: string | null;
  currentSession: VisitorSessionSummary | null;
  firstSeenAt: string;
  identities: ReadonlyArray<
    Readonly<{
      displayName: string | null;
      email: string | null;
      provider: string;
    }>
  >;
  lastSeenAt: string;
  previousSessions: VisitorSessionSummary[];
  timeline: Readonly<{
    entries: VisitorTimelineEntry[];
    nextCursor: string | null;
  }>;
  totalVisits: number;
  visitorId: string;
}>;

export type VisitorSessionSummary = Readonly<{
  activeDurationSeconds: number;
  browserName: string | null;
  city: string | null;
  country: string | null;
  currentUrl: string | null;
  deviceType: string | null;
  endedAt: string | null;
  lastSeenAt: string;
  sessionId: string;
  startedAt: string;
}>;

export type SiteAnalytics = Readonly<{
  averageActiveSessionSeconds: number;
  countryDistribution: ReadonlyArray<Readonly<{ country: string; visitors: number }>>;
  ctaEvents: ReadonlyArray<Readonly<{ count: number; name: string; type: string }>>;
  newVisitors: number;
  period: DashboardDateRange;
  referrers: ReadonlyArray<Readonly<{ count: number; referrer: string }>>;
  returningVisitors: number;
  topActivePages: ReadonlyArray<Readonly<{ activeSeconds: number; path: string }>>;
  topLandingPages: ReadonlyArray<Readonly<{ path: string; views: number }>>;
  totalVisitors: number;
  utmCampaigns: ReadonlyArray<Readonly<{ campaign: string; count: number }>>;
}>;

function encodeTimelineCursor(cursor: TimelineCursorValue): string {
  return Buffer.from(JSON.stringify(cursor)).toString('base64url');
}

function parseTimelineCursor(cursor: string | undefined): TimelineCursorValue | null {
  if (!cursor) return null;

  try {
    const decoded: unknown = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    return TimelineCursorSchema.parse(decoded);
  } catch {
    return null;
  }
}

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

function mapSession(session: {
  activeDurationSeconds: number;
  browserName: string | null;
  currentUrl: string | null;
  deviceType: string | null;
  endedAt: Date | null;
  geoCity: string | null;
  geoCountry: string | null;
  id: string;
  lastSeenAt: Date;
  startedAt: Date;
}): VisitorSessionSummary {
  return {
    activeDurationSeconds: session.activeDurationSeconds,
    browserName: session.browserName,
    city: session.geoCity,
    country: session.geoCountry,
    currentUrl: session.currentUrl,
    deviceType: session.deviceType,
    endedAt: session.endedAt?.toISOString() ?? null,
    lastSeenAt: session.lastSeenAt.toISOString(),
    sessionId: session.id,
    startedAt: session.startedAt.toISOString(),
  };
}

export function toUtcDateRange(
  range: DashboardDateRange,
): Readonly<{ from: Date; toExclusive: Date }> {
  const from = new Date(`${range.from}T00:00:00.000Z`);
  const toExclusive = new Date(`${range.to}T00:00:00.000Z`);
  toExclusive.setUTCDate(toExclusive.getUTCDate() + 1);
  return { from, toExclusive };
}

export async function getVisitorProfile(
  siteId: string,
  visitorId: string,
  input: unknown,
): Promise<VisitorProfile | null> {
  const parsedInput = VisitorTimelineInputSchema.safeParse(input);
  if (!parsedInput.success) return null;

  const cursor = parseTimelineCursor(parsedInput.data.cursor);
  if (parsedInput.data.cursor && !cursor) return null;

  const prisma = getDatabaseClient();
  const visitor = await prisma.visitor.findFirst({
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

  if (!visitor) return null;

  const sessionWhere: Prisma.SessionWhereInput = { siteId, visitorId };
  const pageViewWhere: Prisma.PageViewWhereInput = {
    AND: [
      { session: { is: sessionWhere } },
      cursorFilter('enteredAt', cursor, 'page_view') as Prisma.PageViewWhereInput,
    ],
  };
  const eventWhere: Prisma.VisitorEventWhereInput = {
    AND: [
      { siteId, visitorId },
      cursorFilter('createdAt', cursor, 'event') as Prisma.VisitorEventWhereInput,
    ],
  };

  const [sessions, pageViews, events] = await Promise.all([
    prisma.session.findMany({
      where: sessionWhere,
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
    }),
    prisma.pageView.findMany({
      where: pageViewWhere,
      orderBy: [{ enteredAt: 'desc' }, { id: 'desc' }],
      select: {
        activeDurationSeconds: true,
        enteredAt: true,
        id: true,
        maxScrollPercent: true,
        path: true,
        title: true,
      },
      take: parsedInput.data.limit + 1,
    }),
    prisma.visitorEvent.findMany({
      where: eventWhere,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: { createdAt: true, id: true, name: true, type: true },
      take: parsedInput.data.limit + 1,
    }),
  ]);

  const currentSession = sessions.at(0);
  const timeline = mergeTimelineEntries(
    pageViews.map((pageView) => ({
      activeDurationSeconds: pageView.activeDurationSeconds,
      id: pageView.id,
      kind: 'page_view' as const,
      maxScrollPercent: pageView.maxScrollPercent,
      name: pageView.title ?? pageView.path,
      occurredAt: pageView.enteredAt.toISOString(),
      path: pageView.path,
      title: pageView.title,
      type: 'page_view',
    })),
    events.map((event) => ({
      activeDurationSeconds: null,
      id: event.id,
      kind: 'event' as const,
      maxScrollPercent: null,
      name: event.name,
      occurredAt: event.createdAt.toISOString(),
      path: null,
      title: null,
      type: event.type,
    })),
    parsedInput.data.limit,
  );

  return {
    attribution: {
      campaign: currentSession?.utmCampaign ?? null,
      medium: currentSession?.utmMedium ?? null,
      referrer: currentSession?.referrerUrl ?? null,
      source: currentSession?.utmSource ?? null,
    },
    chatThreadCount: visitor._count.chatThreads,
    latestChatThreadId: visitor.chatThreads[0]?.id ?? null,
    currentSession: currentSession ? mapSession(currentSession) : null,
    firstSeenAt: visitor.firstSeenAt.toISOString(),
    identities: visitor.identities,
    lastSeenAt: visitor.lastSeenAt.toISOString(),
    previousSessions: sessions.slice(1).map(mapSession),
    timeline: {
      entries: timeline.entries,
      nextCursor: timeline.nextCursor ? encodeTimelineCursor(timeline.nextCursor) : null,
    },
    totalVisits: visitor._count.sessions,
    visitorId,
  };
}

export async function getSiteAnalytics(
  siteId: string,
  input: unknown,
): Promise<SiteAnalytics | null> {
  const parsedRange = DashboardDateRangeSchema.safeParse(input);
  if (!parsedRange.success) return null;

  const period = toUtcDateRange(parsedRange.data);
  const prisma = getDatabaseClient();
  const sessionsInRange: Prisma.SessionWhereInput = {
    lastSeenAt: { gte: period.from, lt: period.toExclusive },
    siteId,
  };
  const pageViewsInRange: Prisma.PageViewWhereInput = {
    enteredAt: { gte: period.from, lt: period.toExclusive },
    session: { is: { siteId } },
  };

  const [
    visitorGroups,
    sessionAverage,
    landingPages,
    activePages,
    referrers,
    campaigns,
    countries,
    ctaEvents,
  ] = await Promise.all([
    prisma.session.groupBy({ by: ['visitorId'], where: sessionsInRange }),
    prisma.session.aggregate({ _avg: { activeDurationSeconds: true }, where: sessionsInRange }),
    prisma.pageView.groupBy({
      _count: { path: true },
      by: ['path'],
      orderBy: { _count: { path: 'desc' } },
      take: 5,
      where: pageViewsInRange,
    }),
    prisma.pageView.groupBy({
      _sum: { activeDurationSeconds: true },
      by: ['path'],
      orderBy: { _sum: { activeDurationSeconds: 'desc' } },
      take: 5,
      where: pageViewsInRange,
    }),
    prisma.session.groupBy({
      _count: { referrerUrl: true },
      by: ['referrerUrl'],
      orderBy: { _count: { referrerUrl: 'desc' } },
      take: 5,
      where: { ...sessionsInRange, referrerUrl: { not: null } },
    }),
    prisma.session.groupBy({
      _count: { utmCampaign: true },
      by: ['utmCampaign'],
      orderBy: { _count: { utmCampaign: 'desc' } },
      take: 5,
      where: { ...sessionsInRange, utmCampaign: { not: null } },
    }),
    prisma.session.groupBy({
      _count: { geoCountry: true },
      by: ['geoCountry'],
      orderBy: { _count: { geoCountry: 'desc' } },
      take: 10,
      where: { ...sessionsInRange, geoCountry: { not: null } },
    }),
    prisma.visitorEvent.groupBy({
      _count: { id: true },
      by: ['type', 'name'],
      orderBy: { _count: { id: 'desc' } },
      take: 10,
      where: {
        createdAt: { gte: period.from, lt: period.toExclusive },
        siteId,
        type: { in: ['cta_click', 'custom'] },
      },
    }),
  ]);

  const visitorIds = visitorGroups.map((group) => group.visitorId);
  const newVisitors = visitorIds.length
    ? await prisma.visitor.count({
        where: {
          firstSeenAt: { gte: period.from, lt: period.toExclusive },
          id: { in: visitorIds },
          siteId,
        },
      })
    : 0;
  const metrics = buildVisitorMetrics({
    averageActiveSessionSeconds: sessionAverage._avg.activeDurationSeconds,
    newVisitors,
    totalVisitors: visitorIds.length,
  });

  return {
    ...metrics,
    countryDistribution: countries.flatMap((country) =>
      country.geoCountry
        ? [{ country: country.geoCountry, visitors: country._count.geoCountry }]
        : [],
    ),
    ctaEvents: ctaEvents.map((event) => ({
      count: event._count.id,
      name: event.name,
      type: event.type,
    })),
    period: parsedRange.data,
    referrers: referrers.flatMap((referrer) =>
      referrer.referrerUrl
        ? [{ count: referrer._count.referrerUrl, referrer: referrer.referrerUrl }]
        : [],
    ),
    topActivePages: activePages.map((page) => ({
      activeSeconds: page._sum.activeDurationSeconds ?? 0,
      path: page.path,
    })),
    topLandingPages: landingPages.map((page) => ({ path: page.path, views: page._count.path })),
    utmCampaigns: campaigns.flatMap((campaign) =>
      campaign.utmCampaign
        ? [{ campaign: campaign.utmCampaign, count: campaign._count.utmCampaign }]
        : [],
    ),
  };
}
