import { describe, expect, it } from 'vitest';

import { readTrustedClientIp } from './client-ip';

describe('readTrustedClientIp', () => {
  it.each([
    ['203.0.113.10', '203.0.113.10'],
    ['2001:db8::10', '2001:db8::10'],
    ['::ffff:203.0.113.10', '203.0.113.10'],
    [' 203.0.113.10 ', '203.0.113.10'],
  ])('accepts a valid trusted edge address %s', (header, expected) => {
    const request = new Request('https://api.example.com', {
      headers: { 'x-real-ip': header },
    });

    expect(readTrustedClientIp(request)).toBe(expected);
  });

  it.each(['', 'unknown', '203.0.113.10:443', '203.0.113.10, 198.51.100.2'])(
    'rejects malformed or chained address %s',
    (header) => {
      const request = new Request('https://api.example.com', {
        headers: { 'x-real-ip': header },
      });

      expect(readTrustedClientIp(request)).toBeNull();
    },
  );

  it('does not trust X-Forwarded-For when the edge address is absent', () => {
    const request = new Request('https://api.example.com', {
      headers: { 'x-forwarded-for': '203.0.113.10' },
    });

    expect(readTrustedClientIp(request)).toBeNull();
  });
});
