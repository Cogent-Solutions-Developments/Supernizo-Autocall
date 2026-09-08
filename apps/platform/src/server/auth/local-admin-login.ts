import 'server-only';

import { createHmac } from 'node:crypto';
import { Redis } from '@upstash/redis';
import { compare } from 'bcryptjs';
import { z } from 'zod';
import { getDatabaseClient } from '@/server/db/client';
import { getAuthenticationEnvironment, getRedisEnvironment } from '@/server/env';

const credentialsSchema = z.object({
  email: z.string().trim().email().max(191),
  password: z.string().min(1).max(1024),
});

export async function authorizeLocalAdmin(credentials: unknown) {
  const parsed = credentialsSchema.safeParse(credentials);
  if (!parsed.success) return null;
  if (process.env.NODE_ENV === 'production') {
    const environment = getRedisEnvironment();
    const redis = new Redis({
      url: environment.UPSTASH_REDIS_REST_URL,
      token: environment.UPSTASH_REDIS_REST_TOKEN,
    });
    const digest = createHmac('sha256', getAuthenticationEnvironment().AUTH_SECRET)
      .update(parsed.data.email.toLowerCase())
      .digest('hex');
    const count = await redis.eval(
      "local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('EXPIRE',KEYS[1],60) end; return n",
      [`autocall:admin-login:${digest}`],
      [],
    );
    if (z.number().int().parse(count) > 10) return null;
  }
  const user = await getDatabaseClient().user.findUnique({
    where: { email: parsed.data.email },
    select: {
      displayName: true,
      email: true,
      globalRole: true,
      id: true,
      passwordHash: true,
      supernizoId: true,
    },
  });
  if (!user?.passwordHash || user.globalRole !== 'ADMIN' || user.supernizoId) return null;
  if (!(await compare(parsed.data.password, user.passwordHash))) return null;
  return { email: user.email, id: user.id, name: user.displayName, role: user.globalRole };
}
