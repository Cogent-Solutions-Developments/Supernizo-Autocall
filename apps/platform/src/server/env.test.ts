import { describe, expect, it } from 'vitest';

import {
  EnvironmentConfigurationError,
  getEnvironmentReadiness,
  getServerEnvironment,
} from './env';

const completeEnvironment = {
  APP_URL: 'http://localhost:3000',
  AUTH_SECRET: 'a'.repeat(32),
  DATABASE_URL: 'mysql://user:password@localhost:3306/supernizo',
  LIVEKIT_API_KEY: 'api-key',
  LIVEKIT_API_SECRET: 'api-secret',
  LIVEKIT_URL: 'wss://supernizo.livekit.cloud',
  TRACKING_IP_HASH_SECRET: 'b'.repeat(32),
  UPSTASH_REDIS_REST_TOKEN: 'redis-token',
  UPSTASH_REDIS_REST_URL: 'https://example.upstash.io',
};

describe('server environment', () => {
  it('returns parsed server configuration when all variables are valid', () => {
    expect(getServerEnvironment(completeEnvironment).DATABASE_URL).toContain('mysql://');
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
      livekit: false,
      redis: false,
      realtime: false,
      trackingIpHash: false,
    });
  });
});
