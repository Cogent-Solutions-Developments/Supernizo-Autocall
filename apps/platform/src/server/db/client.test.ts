import { describe, expect, it } from 'vitest';

import { getDatabaseClient } from './client';

describe('database client', () => {
  it('reuses one Prisma client within the current runtime', () => {
    expect(getDatabaseClient()).toBe(getDatabaseClient());
  });
});
