export type FindVisitorResult = null | {
  _count: { chatThreads: number; sessions: number };
  lastSeenAt: Date;
  chatThreads: Array<{ id: string }>;
  firstSeenAt: Date;
  identities: Array<{ email: null | string; displayName: null | string; provider: string }>;
};

export type ListSessionsResult = Array<{
  id: string;
  startedAt: Date;
  endedAt: null | Date;
  currentUrl: null | string;
  referrerUrl: null | string;
  utmSource: null | string;
  utmMedium: null | string;
  utmCampaign: null | string;
  geoCountry: null | string;
  geoCity: null | string;
  deviceType: null | string;
  browserName: null | string;
  lastSeenAt: Date;
  activeDurationSeconds: number;
}>;

export type ListPageViewsResult = Array<{
  id: string;
  activeDurationSeconds: number;
  path: string;
  title: null | string;
  enteredAt: Date;
  maxScrollPercent: number;
}>;

export type ListEventsResult = Array<{ id: string; type: string; createdAt: Date; name: string }>;

export type AverageSessionActivityResult = { _avg: { activeDurationSeconds: null | number } };

export type TopLandingPagesResult = Array<{ path: string; _count: { path: number } }>;

export type TopActivePagesResult = Array<{
  path: string;
  _sum: { activeDurationSeconds: null | number };
}>;

export type TopReferrersResult = Array<{
  referrerUrl: null | string;
  _count: { referrerUrl: number };
}>;

export type TopCampaignsResult = Array<{
  utmCampaign: null | string;
  _count: { utmCampaign: number };
}>;

export type CountryDistributionResult = Array<{
  geoCountry: null | string;
  _count: { geoCountry: number };
}>;

export type TopEventsResult = Array<{ type: string; name: string; _count: { id: number } }>;

export interface VisitorInsightsRepositorySession {
  findVisitor(visitorId: string, siteId: string): Promise<FindVisitorResult>;
  listSessions(siteId: string, visitorId: string): Promise<ListSessionsResult>;
  listPageViews(
    siteId: string,
    visitorId: string,
    cursor: null | { id: string; kind: 'event' | 'page_view'; occurredAt: string },
    limit: number,
  ): Promise<ListPageViewsResult>;
  listEvents(
    siteId: string,
    visitorId: string,
    cursor: null | { id: string; kind: 'event' | 'page_view'; occurredAt: string },
    limit: number,
  ): Promise<ListEventsResult>;
  groupVisitors(
    period: { from: Date; toExclusive: Date },
    siteId: string,
  ): Promise<Array<{ visitorId: string }>>;
  averageSessionActivity(
    period: { from: Date; toExclusive: Date },
    siteId: string,
  ): Promise<AverageSessionActivityResult>;
  topLandingPages(
    period: { from: Date; toExclusive: Date },
    siteId: string,
  ): Promise<TopLandingPagesResult>;
  topActivePages(
    period: { from: Date; toExclusive: Date },
    siteId: string,
  ): Promise<TopActivePagesResult>;
  topReferrers(
    period: { from: Date; toExclusive: Date },
    siteId: string,
  ): Promise<TopReferrersResult>;
  topCampaigns(
    period: { from: Date; toExclusive: Date },
    siteId: string,
  ): Promise<TopCampaignsResult>;
  countryDistribution(
    period: { from: Date; toExclusive: Date },
    siteId: string,
  ): Promise<CountryDistributionResult>;
  topEvents(period: { from: Date; toExclusive: Date }, siteId: string): Promise<TopEventsResult>;
  countNewVisitors(
    period: { from: Date; toExclusive: Date },
    visitorIds: Array<string>,
    siteId: string,
  ): Promise<number>;
}
export type VisitorInsightsRepository = VisitorInsightsRepositorySession;
