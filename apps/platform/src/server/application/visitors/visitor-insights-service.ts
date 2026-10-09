import type { VisitorInsightsRepository } from '@/server/application/ports/visitor-insights-repository';
import 'server-only';
import { z } from 'zod';
import {
  DashboardDateRangeSchema,
  IdSchema,
  PaginationSchema,
  UtcDateTimeSchema,
  type DashboardDateRange,
} from '@supernizo/shared';
import {
  buildVisitorMetrics,
  mergeTimelineEntries,
  type TimelineCursorValue,
  type VisitorTimelineEntry,
} from '../../domain/visitors/visitor-insights';

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
export function createVisitorInsightsService(dependencies: {
  repository: VisitorInsightsRepository;
}) {
  const { repository } = dependencies;
  const TimelineCursorSchema = z.object({
    id: IdSchema,
    kind: z.enum(['event', 'page_view']),
    occurredAt: UtcDateTimeSchema,
  });

  const VisitorTimelineInputSchema = PaginationSchema;

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

  function toUtcDateRange(range: DashboardDateRange): Readonly<{ from: Date; toExclusive: Date }> {
    const from = new Date(`${range.from}T00:00:00.000Z`);
    const toExclusive = new Date(`${range.to}T00:00:00.000Z`);
    toExclusive.setUTCDate(toExclusive.getUTCDate() + 1);
    return { from, toExclusive };
  }

  async function getVisitorProfile(
    siteId: string,
    visitorId: string,
    input: unknown,
  ): Promise<VisitorProfile | null> {
    const parsedInput = VisitorTimelineInputSchema.safeParse(input);
    if (!parsedInput.success) return null;

    const cursor = parseTimelineCursor(parsedInput.data.cursor);
    if (parsedInput.data.cursor && !cursor) return null;

    const visitor = await repository.findVisitor(visitorId, siteId);

    if (!visitor) return null;

    const [sessions, pageViews, events] = await Promise.all([
      repository.listSessions(siteId, visitorId),
      repository.listPageViews(siteId, visitorId, cursor, parsedInput.data.limit),
      repository.listEvents(siteId, visitorId, cursor, parsedInput.data.limit),
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

  async function getSiteAnalytics(siteId: string, input: unknown): Promise<SiteAnalytics | null> {
    const parsedRange = DashboardDateRangeSchema.safeParse(input);
    if (!parsedRange.success) return null;

    const period = toUtcDateRange(parsedRange.data);
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
      repository.groupVisitors(period, siteId),
      repository.averageSessionActivity(period, siteId),
      repository.topLandingPages(period, siteId),
      repository.topActivePages(period, siteId),
      repository.topReferrers(period, siteId),
      repository.topCampaigns(period, siteId),
      repository.countryDistribution(period, siteId),
      repository.topEvents(period, siteId),
    ]);

    const visitorIds = visitorGroups.map((group) => group.visitorId);
    const newVisitors = visitorIds.length
      ? await repository.countNewVisitors(period, visitorIds, siteId)
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
  return { toUtcDateRange, getVisitorProfile, getSiteAnalytics };
}
