import type { JsonValue } from './json-value';
export type FindSiteResult = null | {
  id: string;
  status: 'ACTIVE' | 'INACTIVE';
  createdAt: Date;
  updatedAt: Date;
  name: string;
  publicKey: string;
  allowedOrigins: JsonValue;
  widgetDisplayName: null | string;
  widgetAvatarUrl: null | string;
  widgetLogoUrl: null | string;
  trackingEnabled: boolean;
  chatEnabled: boolean;
  audioCallEnabled: boolean;
  videoCallEnabled: boolean;
  consentMode: null | string;
  eventRetentionDays: null | number;
};

export type UpsertVisitorResult = {
  id: string;
  siteId: string;
  createdAt: Date;
  updatedAt: Date;
  lastSeenAt: Date;
  anonymousId: string;
  firstSeenAt: Date;
};

export type FindSessionResult = null | {
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

export type UpsertSessionResult = {
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

export interface TrackerBootstrapRepositorySession {
  findSite(payload: {
    browser: {
      language: string;
      referrer: null | string;
      screenHeight: number;
      screenWidth: number;
      timezone: null | string;
      title: string;
      url: string;
      userAgent: string;
      clientHints?:
        | undefined
        | {
            brands?: undefined | Array<{ brand: string; version: string }>;
            mobile?: undefined | false | true;
            platform?: undefined | string;
          };
    };
    sessionId: string;
    sitePublicKey: string;
    visitorId: string;
  }): Promise<FindSiteResult>;
  upsertVisitor(
    payload: {
      browser: {
        language: string;
        referrer: null | string;
        screenHeight: number;
        screenWidth: number;
        timezone: null | string;
        title: string;
        url: string;
        userAgent: string;
        clientHints?:
          | undefined
          | {
              brands?: undefined | Array<{ brand: string; version: string }>;
              mobile?: undefined | false | true;
              platform?: undefined | string;
            };
      };
      sessionId: string;
      sitePublicKey: string;
      visitorId: string;
    },
    now: Date,
    site: {
      id: string;
      status: 'ACTIVE' | 'INACTIVE';
      createdAt: Date;
      updatedAt: Date;
      name: string;
      publicKey: string;
      allowedOrigins: JsonValue;
      widgetDisplayName: null | string;
      widgetAvatarUrl: null | string;
      widgetLogoUrl: null | string;
      trackingEnabled: boolean;
      chatEnabled: boolean;
      audioCallEnabled: boolean;
      videoCallEnabled: boolean;
      consentMode: null | string;
      eventRetentionDays: null | number;
    },
  ): Promise<UpsertVisitorResult>;
  findSession(payload: {
    browser: {
      language: string;
      referrer: null | string;
      screenHeight: number;
      screenWidth: number;
      timezone: null | string;
      title: string;
      url: string;
      userAgent: string;
      clientHints?:
        | undefined
        | {
            brands?: undefined | Array<{ brand: string; version: string }>;
            mobile?: undefined | false | true;
            platform?: undefined | string;
          };
    };
    sessionId: string;
    sitePublicKey: string;
    visitorId: string;
  }): Promise<FindSessionResult>;
  upsertSession(
    payload: {
      browser: {
        language: string;
        referrer: null | string;
        screenHeight: number;
        screenWidth: number;
        timezone: null | string;
        title: string;
        url: string;
        userAgent: string;
        clientHints?:
          | undefined
          | {
              brands?: undefined | Array<{ brand: string; version: string }>;
              mobile?: undefined | false | true;
              platform?: undefined | string;
            };
      };
      sessionId: string;
      sitePublicKey: string;
      visitorId: string;
    },
    now: Date,
    site: {
      id: string;
      status: 'ACTIVE' | 'INACTIVE';
      createdAt: Date;
      updatedAt: Date;
      name: string;
      publicKey: string;
      allowedOrigins: JsonValue;
      widgetDisplayName: null | string;
      widgetAvatarUrl: null | string;
      widgetLogoUrl: null | string;
      trackingEnabled: boolean;
      chatEnabled: boolean;
      audioCallEnabled: boolean;
      videoCallEnabled: boolean;
      consentMode: null | string;
      eventRetentionDays: null | number;
    },
    visitor: {
      id: string;
      siteId: string;
      createdAt: Date;
      updatedAt: Date;
      lastSeenAt: Date;
      anonymousId: string;
      firstSeenAt: Date;
    },
    sessionDetails: {
      utmCampaign: null | string;
      utmContent: null | string;
      utmMedium: null | string;
      utmSource: null | string;
      utmTerm: null | string;
      geoCity: null | string;
      geoCountry: null | string;
      geoRegion: null | string;
      browserName: null | string;
      currentUrl: string;
      deviceType: string;
      geoTimezone: null | string;
      operatingSystem: null | string;
      referrerUrl: null | string;
    },
  ): Promise<UpsertSessionResult>;
}
export type TrackerBootstrapRepository = TrackerBootstrapRepositorySession;
