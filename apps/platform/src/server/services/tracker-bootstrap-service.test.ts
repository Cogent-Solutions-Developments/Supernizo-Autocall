import { describe, expect, it, vi } from 'vitest';

import { ForbiddenError, NotFoundError } from '@/server/errors/app-error';

import { assertTrackingSiteAccess, readApproximateGeo } from './tracker-bootstrap-service';

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
