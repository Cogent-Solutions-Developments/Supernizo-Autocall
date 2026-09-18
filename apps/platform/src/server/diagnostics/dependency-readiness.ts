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
    ready: database && redis,
    redis,
  };
}
