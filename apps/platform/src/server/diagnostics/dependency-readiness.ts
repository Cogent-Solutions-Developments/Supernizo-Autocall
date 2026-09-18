import 'server-only';

import { getDatabaseClient } from '@/server/db/client';
import { getRedisClient } from '@/server/redis/client';

export type DependencyReadiness = Readonly<{
  database: boolean;
  ready: boolean;
  redis: boolean;
}>;

export async function getDependencyReadiness(): Promise<DependencyReadiness> {
  const [databaseResult, redisResult] = await Promise.allSettled([
    getDatabaseClient().$queryRaw`SELECT 1`,
    getRedisClient().ping(),
  ]);
  const database = databaseResult.status === 'fulfilled';
  const redis = redisResult.status === 'fulfilled';

  return {
    database,
    // PostgreSQL is the durable system of record and the deployment readiness
    // gate. Redis is reported separately so transient provider failures do not
    // replace an otherwise healthy application during deployment.
    ready: database,
    redis,
  };
}
