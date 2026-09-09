import { AddressNotFoundError, type City, type ReaderModel } from '@maxmind/geoip2-node';
import { describe, expect, it, vi } from 'vitest';

import type { Logger } from '@/server/logging/logger';

import { createGeoIpLocator } from './reader';

function createLogger(): Readonly<{ log: ReturnType<typeof vi.fn>; logger: Logger }> {
  const log = vi.fn();
  return { log, logger: { log } };
}

describe('GeoIP reader', () => {
  it('maps city, country, and first-level region without returning the IP address', async () => {
    const city = vi.fn(
      () =>
        ({
          city: { names: { en: 'Colombo' } },
          country: { isoCode: 'lk' },
          subdivisions: [{ names: { en: 'Western Province' } }],
        }) as City,
    );
    const openReader = vi.fn(async () => ({ city }) as Pick<ReaderModel, 'city'>);
    const { logger } = createLogger();
    const lookup = createGeoIpLocator({
      getDatabasePath: () => '/usr/share/GeoIP/GeoLite2-City.mmdb',
      log: logger,
      openReader,
    });

    await expect(lookup('1.1.1.1')).resolves.toEqual({
      geoCity: 'Colombo',
      geoCountry: 'LK',
      geoRegion: 'Western Province',
    });
    await lookup('8.8.8.8');

    expect(openReader).toHaveBeenCalledOnce();
    expect(openReader).toHaveBeenCalledWith('/usr/share/GeoIP/GeoLite2-City.mmdb');
  });

  it('returns empty optional location fields when the address is not in the database', async () => {
    const { log, logger } = createLogger();
    const lookup = createGeoIpLocator({
      getDatabasePath: () => '/usr/share/GeoIP/GeoLite2-City.mmdb',
      log: logger,
      openReader: async () => ({
        city() {
          throw new AddressNotFoundError('Address not found');
        },
      }),
    });

    await expect(lookup('192.0.2.1')).resolves.toEqual({
      geoCity: null,
      geoCountry: null,
      geoRegion: null,
    });
    expect(log).not.toHaveBeenCalled();
  });

  it('does not leak an IP address when logging an unexpected lookup failure', async () => {
    const { log, logger } = createLogger();
    const lookup = createGeoIpLocator({
      getDatabasePath: () => '/usr/share/GeoIP/GeoLite2-City.mmdb',
      log: logger,
      openReader: async () => {
        throw new Error('Cannot open database for 203.0.113.10');
      },
    });

    await expect(lookup('203.0.113.10')).resolves.toEqual({
      geoCity: null,
      geoCountry: null,
      geoRegion: null,
    });
    expect(log).toHaveBeenCalledWith('warn', 'geoip_lookup_failed', {
      errorName: 'Error',
    });
    expect(JSON.stringify(log.mock.calls)).not.toContain('203.0.113.10');
  });
});
