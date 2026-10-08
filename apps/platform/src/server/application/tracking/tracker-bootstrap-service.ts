import type { TrackerBootstrapRepository } from '@/server/application/ports/tracker-bootstrap-repository';
import 'server-only';
import { z } from 'zod';
import type { TrackerBootstrapRequest, TrackerBootstrapResponse } from '@supernizo/shared';
import { ConflictError, ForbiddenError, NotFoundError } from '@/server/domain/errors/app-error';
import { isOriginAllowed } from '@/server/domain/sites/origins';
import type {
  RuntimeProviders,
  ApproximateGeo,
} from '@/server/application/ports/runtime-providers';
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

type GeoIpLookup = (ipAddress: string) => Promise<ApproximateGeo>;
export function createTrackerBootstrapService(
  dependencies: Pick<
    RuntimeProviders,
    | 'lookupApproximateGeo'
    | 'readTrustedClientIp'
    | 'getLiveKitPublicConfig'
    | 'createVisitorRealtimeToken'
  > & { repository: TrackerBootstrapRepository },
) {
  const {
    repository,
    lookupApproximateGeo,
    readTrustedClientIp,
    getLiveKitPublicConfig,
    createVisitorRealtimeToken,
  } = dependencies;
  const StoredAllowedOriginsSchema = z.array(z.string()).min(1).max(100);

  function readAllowedOrigins(value: unknown): readonly string[] {
    const parsedOrigins = StoredAllowedOriginsSchema.safeParse(value);

    if (!parsedOrigins.success) {
      throw new ForbiddenError('Tracking is not available for this site.');
    }

    return parsedOrigins.data;
  }

  function assertTrackingSiteAccess(site: TrackingSiteAccess | null, origin: string): void {
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

  async function readApproximateGeo(
    request: Request,
    lookup: GeoIpLookup = lookupApproximateGeo,
  ): Promise<ApproximateGeo> {
    const ipAddress = readTrustedClientIp(request);

    return ipAddress ? lookup(ipAddress) : { geoCity: null, geoCountry: null, geoRegion: null };
  }

  async function bootstrapTracker(input: TrackerBootstrapInput): Promise<TrackerBootstrapResponse> {
    const site = await repository.findSite(input.payload);
    assertTrackingSiteAccess(site, input.origin);
    if (!site) {
      throw new NotFoundError('The tracking site was not found.');
    }

    const now = new Date();
    const visitor = await repository.upsertVisitor(input.payload, now, site);

    const existingSession = await repository.findSession(input.payload);
    if (
      existingSession &&
      (existingSession.siteId !== site.id || existingSession.visitorId !== visitor.id)
    ) {
      throw new ConflictError('The visitor session does not belong to this site.');
    }

    const browser = input.payload.browser;
    const approximateGeo = await readApproximateGeo(input.request);
    const sessionDetails = {
      browserName: classifyBrowser(browser.userAgent),
      currentUrl: browser.url,
      deviceType: classifyDevice(browser.userAgent, browser.clientHints?.mobile),
      geoTimezone: browser.timezone,
      operatingSystem: classifyOperatingSystem(browser.userAgent, browser.clientHints?.platform),
      referrerUrl: browser.referrer,
      ...approximateGeo,
      ...readUtmValues(browser.url),
    };

    await repository.upsertSession(input.payload, now, site, visitor, sessionDetails);

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
  return { assertTrackingSiteAccess, readApproximateGeo, bootstrapTracker };
}
