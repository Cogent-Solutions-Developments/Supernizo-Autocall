import type { JsonValue } from './json-value';
export type GetPresenceSessionResult = {
  visitor: {
    _count: { sessions: number };
    id: string;
    siteId: string;
    createdAt: Date;
    updatedAt: Date;
    lastSeenAt: Date;
    anonymousId: string;
    firstSeenAt: Date;
  };
  id: string;
  siteId: string;
  visitorId: string;
  startedAt: Date;
  endedAt: null | Date;
  createdAt: Date;
  updatedAt: Date;
  anonymousSessionId: string;
  currentUrl: null | string;
  referrerUrl: null | string;
  utmSource: null | string;
  utmMedium: null | string;
  utmCampaign: null | string;
  utmTerm: null | string;
  utmContent: null | string;
  geoCountry: null | string;
  geoRegion: null | string;
  geoCity: null | string;
  geoTimezone: null | string;
  deviceType: null | string;
  browserName: null | string;
  operatingSystem: null | string;
  lastSeenAt: Date;
  activeDurationSeconds: number;
};

export type FindTrackingSessionResult = null | {
  id: string;
  siteId: string;
  visitorId: string;
  site: {
    id: string;
    status: 'ACTIVE' | 'INACTIVE';
    allowedOrigins: JsonValue;
    trackingEnabled: boolean;
  };
  visitor: { id: string; siteId: string };
};

export type FindPageViewResult = null | {
  id: string;
  sessionId: string;
  activeDurationSeconds: number;
  url: string;
  path: string;
  title: null | string;
  anonymousPageViewId: string;
  enteredAt: Date;
  leftAt: null | Date;
  maxScrollPercent: number;
};

export type TouchSessionResult = {
  id: string;
  siteId: string;
  visitorId: string;
  startedAt: Date;
  endedAt: null | Date;
  createdAt: Date;
  updatedAt: Date;
  anonymousSessionId: string;
  currentUrl: null | string;
  referrerUrl: null | string;
  utmSource: null | string;
  utmMedium: null | string;
  utmCampaign: null | string;
  utmTerm: null | string;
  utmContent: null | string;
  geoCountry: null | string;
  geoRegion: null | string;
  geoCity: null | string;
  geoTimezone: null | string;
  deviceType: null | string;
  browserName: null | string;
  operatingSystem: null | string;
  lastSeenAt: Date;
  activeDurationSeconds: number;
};

export type TouchVisitorResult = {
  id: string;
  siteId: string;
  createdAt: Date;
  updatedAt: Date;
  lastSeenAt: Date;
  anonymousId: string;
  firstSeenAt: Date;
};

export type OpenPageViewResult = {
  id: string;
  sessionId: string;
  activeDurationSeconds: number;
  url: string;
  path: string;
  title: null | string;
  anonymousPageViewId: string;
  enteredAt: Date;
  leftAt: null | Date;
  maxScrollPercent: number;
};

export type CreateEventResult = {
  id: string;
  siteId: string;
  visitorId: null | string;
  sessionId: string;
  type: string;
  createdAt: Date;
  name: string;
  payload: JsonValue;
};

export interface TrackerEngagementRepositorySession {
  getPresenceSession(context: {
    sessionId: string;
    siteId: string;
    visitorId: string;
  }): Promise<GetPresenceSessionResult>;
  findTrackingSession(context: {
    sessionId: string;
    sitePublicKey: string;
    visitorId: string;
  }): Promise<FindTrackingSessionResult>;
  findPageView(pageViewId: string): Promise<FindPageViewResult>;
  findPageForRecord(input: {
    origin: string;
    payload: {
      sessionId: string;
      sitePublicKey: string;
      visitorId: string;
      pageViewId: string;
      path: string;
      title: string;
      url: string;
    };
  }): Promise<FindPageViewResult>;
  touchSession(
    input: {
      origin: string;
      payload: {
        sessionId: string;
        sitePublicKey: string;
        visitorId: string;
        pageViewId: string;
        path: string;
        title: string;
        url: string;
      };
    },
    now: Date,
    context: { sessionId: string; siteId: string; visitorId: string },
  ): Promise<TouchSessionResult>;
  touchVisitor(
    now: Date,
    context: { sessionId: string; siteId: string; visitorId: string },
  ): Promise<TouchVisitorResult>;
  openPageView(
    input: {
      origin: string;
      payload: {
        sessionId: string;
        sitePublicKey: string;
        visitorId: string;
        pageViewId: string;
        path: string;
        title: string;
        url: string;
      };
    },
    now: Date,
    context: { sessionId: string; siteId: string; visitorId: string },
  ): Promise<OpenPageViewResult>;
  incrementSessionActivity(
    payload: {
      sessionId: string;
      sitePublicKey: string;
      visitorId: string;
      activeSecondsDelta: number;
      maxScrollPercent: number;
      pageViewId: string;
    },
    now: Date,
    context: { sessionId: string; siteId: string; visitorId: string },
  ): Promise<TouchSessionResult>;
  touchActiveVisitor(
    now: Date,
    context: { sessionId: string; siteId: string; visitorId: string },
  ): Promise<TouchVisitorResult>;
  updatePageMetrics(
    payload: {
      sessionId: string;
      sitePublicKey: string;
      visitorId: string;
      activeSecondsDelta: number;
      maxScrollPercent: number;
      pageViewId: string;
    },
    leave: boolean,
    now: Date,
    pageViewId: string,
  ): Promise<OpenPageViewResult>;
  touchEventSession(context: {
    sessionId: string;
    siteId: string;
    visitorId: string;
  }): Promise<TouchSessionResult>;
  createEvent(
    input: {
      origin: string;
      payload: {
        sessionId: string;
        sitePublicKey: string;
        visitorId: string;
        metadata: { [key: string]: null | string | number | false | true };
        name: string;
        type: 'custom' | 'cta_click' | 'download' | 'form_start' | 'form_submit' | 'scroll_depth';
        pageViewId?: undefined | string;
      };
    },
    context: { sessionId: string; siteId: string; visitorId: string },
  ): Promise<CreateEventResult>;
}
export type TrackerEngagementRepository = TrackerEngagementRepositorySession;
