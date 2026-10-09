import { describe, expect, it } from 'vitest';

import {
  EnvironmentConfigurationError,
  getApplicationEnvironment,
  getEnvironmentReadiness,
  getGeoIpEnvironment,
  getServerEnvironment,
} from './env';

const completeEnvironment = {
  APP_URL: 'http://localhost:3000',
  AUTH_SECRET: 'a'.repeat(32),
  DATABASE_URL: 'postgresql://user:password@localhost:5432/supernizo',
  GEOIP_DATABASE_PATH: '/usr/share/GeoIP/GeoLite2-City.mmdb',
  LIVEKIT_API_KEY: 'api-key',
  LIVEKIT_API_SECRET: 'api-secret',
  LIVEKIT_URL: 'wss://supernizo.livekit.cloud',
  TRACKING_IP_HASH_SECRET: 'b'.repeat(32),
  UPSTASH_REDIS_REST_TOKEN: 'redis-token',
  UPSTASH_REDIS_REST_URL: 'https://example.upstash.io',
};

describe('server environment', () => {
  it('returns parsed server configuration when all variables are valid', () => {
    expect(getServerEnvironment(completeEnvironment).DATABASE_URL).toContain('postgresql://');
  });

  it('fails fast with readable variable names but no values', () => {
    try {
      getServerEnvironment({ ...completeEnvironment, LIVEKIT_API_SECRET: '' });
      throw new Error('Expected configuration validation to fail.');
    } catch (error: unknown) {
      expect(error).toBeInstanceOf(EnvironmentConfigurationError);
      expect(error).toMatchObject({ invalidVariables: ['LIVEKIT_API_SECRET'] });
      expect(error).toHaveProperty(
        'message',
        'Server environment configuration is missing or invalid: LIVEKIT_API_SECRET.',
      );
      expect((error as Error).message).not.toContain('api-secret');
    }
  });

  it('reports non-sensitive readiness checks for incomplete configuration', () => {
    expect(getEnvironmentReadiness({ APP_URL: 'http://localhost:3000' })).toEqual({
      appUrl: true,
      auth: false,
      database: false,
      geoIp: false,
      livekit: false,
      redis: false,
      realtime: false,
      trackingIpHash: false,
    });
  });

  it('rejects non-PostgreSQL database URLs', () => {
    expect(() =>
      getServerEnvironment({
        ...completeEnvironment,
        DATABASE_URL: 'mysql://user:password@localhost:3306/supernizo',
      }),
    ).toThrowError(
      expect.objectContaining({
        invalidVariables: ['DATABASE_URL'],
      }),
    );
  });

  it('returns a validated absolute GeoIP database path', () => {
    expect(getGeoIpEnvironment(completeEnvironment)).toEqual({
      GEOIP_DATABASE_PATH: '/usr/share/GeoIP/GeoLite2-City.mmdb',
    });
  });

  it('rejects a relative or non-MMDB GeoIP database path', () => {
    for (const GEOIP_DATABASE_PATH of ['GeoLite2-City.mmdb', '/var/lib/GeoIP/city.csv']) {
      expect(() => getGeoIpEnvironment({ GEOIP_DATABASE_PATH })).toThrowError(
        expect.objectContaining({ invalidVariables: ['GEOIP_DATABASE_PATH'] }),
      );
    }
  });
});

describe('application environment', () => {
  it('validates the public application URL independently of other dependencies', () => {
    expect(
      getApplicationEnvironment({ APP_URL: 'https://api.infrastructuresg.com/autocall-db' }),
    ).toEqual({
      APP_URL: 'https://api.infrastructuresg.com/autocall-db',
    });
  });

  it('rejects a missing or non-HTTP application URL without exposing its value', () => {
    for (const APP_URL of [undefined, '', 'not-a-url', 'file:///tmp/profile']) {
      expect(() => getApplicationEnvironment({ APP_URL })).toThrowError(
        expect.objectContaining({ invalidVariables: ['APP_URL'] }),
      );
    }
  });
});
