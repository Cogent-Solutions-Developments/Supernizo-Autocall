import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getDependencyReadiness } from './dependency-readiness';

const mocks = vi.hoisted(() => ({
  databaseProbe: vi.fn(),
  redisProbe: vi.fn(),
}));

vi.mock('@/server/db/client', () => ({
  getDatabaseClient: () => ({ $queryRaw: mocks.databaseProbe }),
}));
vi.mock('@/server/redis/client', () => ({
  getRedisClient: () => ({ ping: mocks.redisProbe }),
}));

describe('getDependencyReadiness', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.databaseProbe.mockResolvedValue([{ '?column?': 1 }]);
    mocks.redisProbe.mockResolvedValue('PONG');
  });

  it('requires both PostgreSQL and Redis to be reachable', async () => {
    await expect(getDependencyReadiness()).resolves.toEqual({
      database: true,
      ready: true,
      redis: true,
    });
  });

  it('reports Redis failures without leaking the provider error', async () => {
    mocks.redisProbe.mockRejectedValue(new TypeError('getaddrinfo ENOTFOUND private-host'));

    await expect(getDependencyReadiness()).resolves.toEqual({
      database: true,
      ready: false,
      redis: false,
    });
  });
});
