import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getDependencyReadiness } from '@/server/diagnostics/dependency-readiness';

import { GET } from './route';

vi.mock('@/server/diagnostics/dependency-readiness', () => ({
  getDependencyReadiness: vi.fn(),
}));

describe('GET /api/health/ready', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 200 when PostgreSQL and Redis are reachable', async () => {
    vi.mocked(getDependencyReadiness).mockResolvedValue({
      database: true,
      ready: true,
      redis: true,
    });

    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      database: true,
      ready: true,
      redis: true,
    });
  });

  it('returns 200 and reports degradation when Redis is unreachable', async () => {
    vi.mocked(getDependencyReadiness).mockResolvedValue({
      database: true,
      ready: true,
      redis: false,
    });

    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      database: true,
      ready: true,
      redis: false,
    });
  });

  it('returns 503 when PostgreSQL is unreachable', async () => {
    vi.mocked(getDependencyReadiness).mockResolvedValue({
      database: false,
      ready: false,
      redis: true,
    });

    const response = await GET();

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      database: false,
      ready: false,
      redis: true,
    });
  });
});
