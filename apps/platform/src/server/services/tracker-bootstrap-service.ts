import 'server-only';

import { geolocation } from '@vercel/functions';
import { z } from 'zod';

import type { TrackerBootstrapRequest, TrackerBootstrapResponse } from '@supernizo/shared';

import { ConflictError, ForbiddenError, NotFoundError } from '@/server/errors/app-error';
import { getDatabaseClient } from '@/server/db/client';
import { getLiveKitPublicConfig } from '@/server/livekit/config';
import { isOriginAllowed } from '@/server/sites/origins';
import { createVisitorRealtimeToken } from '@/server/realtime/visitor-token';

const StoredAllowedOriginsSchema = z.array(z.string()).min(1).max(100);

type TrackingSiteAccess = Readonly<{
  allowedOrigins: unknown;
  status: 'ACTIVE' | 'INACTIVE';
  trackingEnabled: boolean;
}>;

type TrackerBootstrapInput = Readonly<{
  origin: string;
  payload: TrackerBootstrapRequest;
  request: Request;
}>;

function readAllowedOrigins(value: unknown): readonly string[] {
  const parsedOrigins = StoredAllowedOriginsSchema.safeParse(value);

  if (!parsedOrigins.success) {
    throw new ForbiddenError('Tracking is not available for this site.');
  }

  return parsedOrigins.data;
}

export function assertTrackingSiteAccess(site: TrackingSiteAccess | null, origin: string): void {
  if (!site) {
    throw new NotFoundError('The tracking site was not found.');
  }

  if (site.status !== 'ACTIVE' || !site.trackingEnabled) {
    throw new ForbiddenError('Tracking is not enabled for this site.');
  }

  if (!isOriginAllowed(readAllowedOrigins(site.allowedOrigins), origin)) {
    throw new ForbiddenError('This origin is not allowed to send tracking data.');
  }
}

function readUtmValues(urlString: string): Readonly<{
  utmCampaign: string | null;
  utmContent: string | null;
  utmMedium: string | null;
  utmSource: string | null;
  utmTerm: string | null;
}> {
  const parameters = new URL(urlString).searchParams;
  const value = (key: string): string | null => parameters.get(key)?.slice(0, 191) ?? null;

  return {
    utmCampaign: value('utm_campaign'),
    utmContent: value('utm_content'),
    utmMedium: value('utm_medium'),
    utmSource: value('utm_source'),
    utmTerm: value('utm_term'),
  };
}

function classifyBrowser(userAgent: string): string | null {
  const normalized = userAgent.toLowerCase();

  if (normalized.includes('edg/')) return 'Edge';
  if (normalized.includes('firefox/')) return 'Firefox';
  if (normalized.includes('chrome/') || normalized.includes('chromium/')) return 'Chrome';
  if (normalized.includes('safari/')) return 'Safari';
  return null;
}

function classifyOperatingSystem(userAgent: string, platform?: string): string | null {
  const normalized = `${platform ?? ''} ${userAgent}`.toLowerCase();

  if (normalized.includes('windows')) return 'Windows';
  if (normalized.includes('android')) return 'Android';
  if (normalized.includes('iphone') || normalized.includes('ipad') || normalized.includes('ios'))
    return 'iOS';
  if (
    normalized.includes('mac os') ||
    normalized.includes('macintosh') ||
    normalized.includes('macos')
  )
    return 'macOS';
  if (normalized.includes('linux')) return 'Linux';
  return null;
}

function classifyDevice(userAgent: string, mobileHint?: boolean): string {
  return mobileHint || /mobile|android|iphone|ipad/i.test(userAgent) ? 'MOBILE' : 'DESKTOP';
}

function readApproximateGeo(request: Request): Readonly<{
  geoCity: string | null;
  geoCountry: string | null;
  geoRegion: string | null;
}> {
  const location = geolocation(request);

  return {
    geoCity: location.city?.slice(0, 191) ?? null,
    geoCountry: location.country?.slice(0, 2).toUpperCase() ?? null,
    geoRegion: location.countryRegion?.slice(0, 191) ?? null,
  };
}

export async function bootstrapTracker(
  input: TrackerBootstrapInput,
): Promise<TrackerBootstrapResponse> {
  const database = getDatabaseClient();
  const site = await database.site.findUnique({
    where: { publicKey: input.payload.sitePublicKey },
  });
  assertTrackingSiteAccess(site, input.origin);
  if (!site) {
    throw new NotFoundError('The tracking site was not found.');
  }

  const now = new Date();
  const visitor = await database.visitor.upsert({
    create: {
      anonymousId: input.payload.visitorId,
      firstSeenAt: now,
      lastSeenAt: now,
      siteId: site.id,
    },
    update: { lastSeenAt: now },
    where: {
      siteId_anonymousId: {
        anonymousId: input.payload.visitorId,
        siteId: site.id,
      },
    },
  });

  const existingSession = await database.session.findUnique({
    where: { anonymousSessionId: input.payload.sessionId },
  });
  if (
    existingSession &&
    (existingSession.siteId !== site.id || existingSession.visitorId !== visitor.id)
  ) {
    throw new ConflictError('The visitor session does not belong to this site.');
  }

  const browser = input.payload.browser;
  const sessionDetails = {
    browserName: classifyBrowser(browser.userAgent),
    currentUrl: browser.url,
    deviceType: classifyDevice(browser.userAgent, browser.clientHints?.mobile),
    geoTimezone: browser.timezone,
    operatingSystem: classifyOperatingSystem(browser.userAgent, browser.clientHints?.platform),
    referrerUrl: browser.referrer,
    ...readApproximateGeo(input.request),
    ...readUtmValues(browser.url),
  };

  await database.session.upsert({
    create: {
      anonymousSessionId: input.payload.sessionId,
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
    where: { anonymousSessionId: input.payload.sessionId },
  });

  const visitorChannel = `visitor:${site.id}:${input.payload.visitorId}`;
  const callsEnabled = site.audioCallEnabled || site.videoCallEnabled;

  return {
    ...(callsEnabled ? { calling: getLiveKitPublicConfig() } : {}),
    features: {
      audioCallEnabled: site.audioCallEnabled,
      chatEnabled: site.chatEnabled,
      trackingEnabled: site.trackingEnabled,
      videoCallEnabled: site.videoCallEnabled,
    },
    heartbeatIntervalSeconds: 30,
    realtime: {
      authorizationToken: createVisitorRealtimeToken(visitorChannel),
      channel: visitorChannel,
    },
    sessionId: input.payload.sessionId,
    visitorId: input.payload.visitorId,
  };
}
