import { describe, expect, it, vi } from 'vitest';

vi.mock('@/server/env', () => ({
  getEnvironmentReadiness: () => ({
    appUrl: true,
    auth: true,
    database: false,
    livekit: true,
    redis: false,
    realtime: false,
    trackingIpHash: true,
  }),
}));

import { getConfigurationReadiness } from './config-readiness';

describe('getConfigurationReadiness', () => {
  it('returns only readiness booleans and a derived status', () => {
    expect(getConfigurationReadiness()).toEqual({
      checks: {
        appUrl: true,
        auth: true,
        database: false,
        livekit: true,
        redis: false,
        realtime: false,
        trackingIpHash: true,
      },
      ready: false,
    });
  });
});
