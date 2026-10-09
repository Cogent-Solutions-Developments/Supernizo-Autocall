import 'server-only';
import { createHmac } from 'node:crypto';
import { Redis } from '@upstash/redis';
import { z } from 'zod';
import {
  getRedisEnvironment,
  getAuthenticationEnvironment,
} from '@/server/infrastructure/config/env';
export async function allowAdminLogin(email: string): Promise<boolean> {
  if (process.env.NODE_ENV === 'production') {
    const environment = getRedisEnvironment();
    const redis = new Redis({
      url: environment.UPSTASH_REDIS_REST_URL,
      token: environment.UPSTASH_REDIS_REST_TOKEN,
    });
    const digest = createHmac('sha256', getAuthenticationEnvironment().AUTH_SECRET)
      .update(email.toLowerCase())
      .digest('hex');
    const count = await redis.eval(
      "local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('EXPIRE',KEYS[1],60) end; return n",
      [`autocall:admin-login:${digest}`],
      [],
    );
    if (z.number().int().parse(count) > 10) return false;
  }
  return true;
}
