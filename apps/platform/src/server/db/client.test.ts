import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { configurePostgresPool, getDatabaseClient } from './client';

describe('database client', () => {
  beforeAll(() => {
    vi.stubEnv('DATABASE_URL', 'postgresql://user:password@localhost:5432/app');
  });

  afterAll(() => {
    vi.unstubAllEnvs();
  });

  it('reuses one Prisma client within the current runtime', () => {
    expect(getDatabaseClient()).toBe(getDatabaseClient());
  });

  it('configures a bounded pool for the self-hosted application process', () => {
    const configured = configurePostgresPool({
      DATABASE_URL: 'postgresql://user:password@postgres:5432/app',
    });

    expect(configured.max).toBe(10);
    expect(configured.idleTimeoutMillis).toBe(30_000);
    expect(configured.connectionTimeoutMillis).toBe(5_000);
    expect(configured.ssl).toBe(false);
  });
});
