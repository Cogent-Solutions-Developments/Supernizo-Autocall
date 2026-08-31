import 'server-only';

import { Redis } from '@upstash/redis';

import { getRedisEnvironment } from '@/server/env';

type RedisGlobal = typeof globalThis & { redis?: Redis };

const redisGlobal = globalThis as RedisGlobal;

export function getRedisClient(): Redis {
  const existingClient = redisGlobal.redis;
  if (existingClient) {
    return existingClient;
  }

  const environment = getRedisEnvironment();
  const client = new Redis({
    token: environment.UPSTASH_REDIS_REST_TOKEN,
    url: environment.UPSTASH_REDIS_REST_URL,
  });

  if (process.env.NODE_ENV !== 'production') {
    redisGlobal.redis = client;
  }

  return client;
}
