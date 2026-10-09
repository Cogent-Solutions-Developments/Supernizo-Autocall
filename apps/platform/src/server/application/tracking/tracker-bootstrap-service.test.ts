import { afterEach, describe, expect, it, vi } from 'vitest';
import { createTrackerBootstrapService } from './tracker-bootstrap-service';
import type {
  TrackerBootstrapRepository,
  UpsertSessionResult,
  FindSiteResult,
  UpsertVisitorResult,
} from '../ports/tracker-bootstrap-repository';

import { ForbiddenError, NotFoundError } from '@/server/domain/errors/app-error';

import {
  assertTrackingSiteAccess,
  readApproximateGeo,
} from '@/server/composition/tracking/tracker-bootstrap-service';

describe('assertTrackingSiteAccess', () => {
  const activeSite = {
    allowedOrigins: ['https://example.com'],
    status: 'ACTIVE' as const,
    trackingEnabled: true,
  };

  it('rejects an origin that is not on the site allowlist', () => {
    expect(() => assertTrackingSiteAccess(activeSite, 'https://untrusted.example')).toThrow(
      ForbiddenError,
    );
  });

  it('rejects an unknown public site key result', () => {
    expect(() => assertTrackingSiteAccess(null, 'https://example.com')).toThrow(NotFoundError);
  });

  it('allows the normalized, registered origin', () => {
    expect(() => assertTrackingSiteAccess(activeSite, 'https://example.com/')).not.toThrow();
  });
});

describe('readApproximateGeo', () => {
  it('looks up the validated address supplied by the trusted reverse proxy', async () => {
    const request = new Request('https://api.infrastructuresg.com/autocall-db', {
      headers: {
        'x-forwarded-for': '198.51.100.20',
        'x-geo-country': 'US',
        'x-real-ip': '203.0.113.10',
      },
    });
    const lookup = vi.fn(async () => ({
      geoCity: 'Colombo',
      geoCountry: 'LK',
      geoRegion: 'Western',
    }));

    await expect(readApproximateGeo(request, lookup)).resolves.toEqual({
      geoCity: 'Colombo',
      geoCountry: 'LK',
      geoRegion: 'Western',
    });
    expect(lookup).toHaveBeenCalledWith('203.0.113.10');
  });

  it('ignores forwarded and geolocation headers when the trusted edge address is absent', async () => {
    const request = new Request('http://localhost', {
      headers: {
        'x-forwarded-for': '203.0.113.10',
        'x-geo-city': 'Spoofed city',
        'x-geo-country': 'US',
      },
    });
    const lookup = vi.fn();

    await expect(readApproximateGeo(request, lookup)).resolves.toEqual({
      geoCity: null,
      geoCountry: null,
      geoRegion: null,
    });
    expect(lookup).not.toHaveBeenCalled();
  });
});

describe('bootstrap chat identity boundary', () => {
  const startedAt = new Date('2026-10-09T10:00:00.000Z');
  const currentTime = new Date('2026-10-09T11:00:00.000Z');
  afterEach(() => vi.useRealTimers());

  function fixture(existing: UpsertSessionResult | null) {
    const site: NonNullable<FindSiteResult> = {
      id: 'site_1',
      name: 'Demo',
      publicKey: 'site_public_demo',
      allowedOrigins: ['https://example.com'],
      status: 'ACTIVE',
      trackingEnabled: true,
      chatEnabled: true,
      audioCallEnabled: false,
      videoCallEnabled: false,
      createdAt: startedAt,
      updatedAt: startedAt,
      widgetDisplayName: null,
      widgetAvatarUrl: null,
      widgetLogoUrl: null,
      consentMode: null,
      eventRetentionDays: null,
    };
    const visitor: UpsertVisitorResult = {
      id: 'visitor_1',
      siteId: site.id,
      anonymousId: '11111111-1111-4111-8111-111111111111',
      firstSeenAt: startedAt,
      lastSeenAt: currentTime,
      createdAt: startedAt,
      updatedAt: currentTime,
    };
    const session = existing ?? { ...sessionRecord(currentTime), startedAt: currentTime };
    const repository: TrackerBootstrapRepository = {
      findSite: vi.fn().mockResolvedValue(site),
      upsertVisitor: vi.fn().mockResolvedValue(visitor),
      findSession: vi.fn().mockResolvedValue(existing),
      upsertSession: vi.fn().mockResolvedValue(session),
    };
    const service = createTrackerBootstrapService({
      repository,
      lookupApproximateGeo: vi
        .fn()
        .mockResolvedValue({ geoCity: null, geoCountry: null, geoRegion: null }),
      readTrustedClientIp: () => null,
      getLiveKitPublicConfig: () => ({ url: 'wss://example.livekit.cloud' }),
      createVisitorRealtimeToken: () => 'visitor-token',
    });
    vi.useFakeTimers();
    vi.setSystemTime(currentTime);
    return {
      service,
      input: {
        origin: 'https://example.com',
        request: new Request('https://example.com/api/track/bootstrap'),
        payload: {
          sitePublicKey: site.publicKey,
          visitorId: visitor.anonymousId,
          sessionId: session.anonymousSessionId,
          browser: {
            userAgent: 'browser',
            language: 'en',
            referrer: null,
            screenHeight: 800,
            screenWidth: 1200,
            timezone: null,
            title: 'Demo',
            url: 'https://example.com',
          },
        },
      },
    };
  }

  function sessionRecord(lastSeenAt: Date): UpsertSessionResult {
    return {
      id: 'session_1',
      siteId: 'site_1',
      visitorId: 'visitor_1',
      anonymousSessionId: '22222222-2222-4222-8222-222222222222',
      startedAt,
      lastSeenAt,
      endedAt: null,
      createdAt: startedAt,
      updatedAt: lastSeenAt,
      currentUrl: null,
      referrerUrl: null,
      utmSource: null,
      utmMedium: null,
      utmCampaign: null,
      utmTerm: null,
      utmContent: null,
      geoCountry: null,
      geoRegion: null,
      geoCity: null,
      geoTimezone: null,
      deviceType: null,
      browserName: null,
      operatingSystem: null,
      activeDurationSeconds: 0,
    };
  }

  it('uses the new session start for a returning visitor with a new session', async () => {
    const { service, input } = fixture(null);
    const response = await service.bootstrapTracker(input);
    expect(response.chatSessionStartedAt).toBe(currentTime.toISOString());
  });

  it('preserves the start during refreshes of an active session', async () => {
    const { service, input } = fixture(sessionRecord(new Date(currentTime.getTime() - 30_000)));
    expect((await service.bootstrapTracker(input)).chatSessionStartedAt).toBe(
      startedAt.toISOString(),
    );
  });

  it('resets when returning after presence has expired', async () => {
    const { service, input } = fixture(sessionRecord(new Date(currentTime.getTime() - 45_000)));
    expect((await service.bootstrapTracker(input)).chatSessionStartedAt).toBe(
      currentTime.toISOString(),
    );
  });

  it('resets when an ended session identifier is reused', async () => {
    const { service, input } = fixture({
      ...sessionRecord(new Date(currentTime.getTime() - 1_000)),
      endedAt: currentTime,
    });
    expect((await service.bootstrapTracker(input)).chatSessionStartedAt).toBe(
      currentTime.toISOString(),
    );
  });
});
