import { describe, expect, it } from 'vitest';

import { ValidationError } from '@/server/errors/app-error';
import { isOriginAllowed, normalizeAllowedOrigins, normalizeOrigin } from './origins';

describe('origin normalization and allowlisting', () => {
  it('normalizes origins and removes duplicates', () => {
    expect(normalizeAllowedOrigins(['HTTPS://Example.com/', 'https://example.com'])).toEqual([
      'https://example.com',
    ]);
    expect(normalizeOrigin('http://localhost:3100/')).toBe('http://localhost:3100');
  });

  it('rejects paths, credentials, queries, and hashes', () => {
    expect(() => normalizeOrigin('https://example.com/path')).toThrow(ValidationError);
    expect(() => normalizeOrigin('https://user:password@example.com')).toThrow(ValidationError);
    expect(() => normalizeOrigin('https://example.com?source=tracker')).toThrow(ValidationError);
    expect(() => normalizeOrigin('https://example.com#widget')).toThrow(ValidationError);
  });

  it('only allows an exact normalized origin', () => {
    const allowedOrigins = ['https://example.com'];

    expect(isOriginAllowed(allowedOrigins, 'https://example.com/')).toBe(true);
    expect(isOriginAllowed(allowedOrigins, 'https://subdomain.example.com')).toBe(false);
    expect(isOriginAllowed(allowedOrigins, 'https://example.com/other')).toBe(false);
  });
});
