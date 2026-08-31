import 'server-only';

import { Redis } from '@upstash/redis';

import { getServerEnvironment } from '@/server/env';

const environment = getServerEnvironment();

export const redis = new Redis({
  token: environment.UPSTASH_REDIS_REST_TOKEN,
  url: environment.UPSTASH_REDIS_REST_URL,
});
