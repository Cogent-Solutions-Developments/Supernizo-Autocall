import { describe, expect, it } from 'vitest';

import { configureDatabaseUrlForServerless, getDatabaseClient } from './client';

describe('database client', () => {
  it('reuses one Prisma client within the current runtime', () => {
    expect(getDatabaseClient()).toBe(getDatabaseClient());
  });

  it('limits each serverless runtime to a small MariaDB connection pool', () => {
    const configured = new URL(
      configureDatabaseUrlForServerless('mysql://user:password@db.example.com:3306/app?ssl=true'),
    );

    expect(configured.searchParams.get('connectionLimit')).toBe('4');
    expect(configured.searchParams.get('idleTimeout')).toBe('60');
    expect(configured.searchParams.get('ssl')).toBe('true');
  });
});
