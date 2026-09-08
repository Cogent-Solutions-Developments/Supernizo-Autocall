import { describe, expect, it } from 'vitest';

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
  it('reads optional location headers supplied by a trusted reverse proxy', () => {
    const request = new Request('https://api.infrastructuresg.com/autocall-db', {
      headers: {
        'x-geo-city': 'Colombo',
        'x-geo-country': 'lk',
        'x-geo-region': 'Western',
      },
    });

    expect(readApproximateGeo(request)).toEqual({
      geoCity: 'Colombo',
      geoCountry: 'LK',
      geoRegion: 'Western',
    });
  });

  it('does not invent location data when the proxy provides none', () => {
    expect(readApproximateGeo(new Request('http://localhost'))).toEqual({
      geoCity: null,
      geoCountry: null,
      geoRegion: null,
    });
  });
});
