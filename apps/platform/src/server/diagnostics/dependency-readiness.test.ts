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

  it('reports PostgreSQL and Redis when both are reachable', async () => {
    await expect(getDependencyReadiness()).resolves.toEqual({
      database: true,
      ready: true,
      redis: true,
    });
  });

  it('reports Redis failures without blocking deployment readiness', async () => {
    mocks.redisProbe.mockRejectedValue(new TypeError('getaddrinfo ENOTFOUND private-host'));

    await expect(getDependencyReadiness()).resolves.toEqual({
      database: true,
      ready: true,
      redis: false,
    });
  });

  it('is not ready when PostgreSQL is unreachable', async () => {
    mocks.databaseProbe.mockRejectedValue(new Error('database unavailable'));

    await expect(getDependencyReadiness()).resolves.toEqual({
      database: false,
      ready: false,
      redis: true,
    });
  });
});
