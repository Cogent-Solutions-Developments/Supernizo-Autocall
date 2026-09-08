import { describe, expect, it } from 'vitest';

import { ForbiddenError, NotFoundError } from '@/server/errors/app-error';

import { assertTrackingSiteAccess } from './tracker-bootstrap-service';

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
