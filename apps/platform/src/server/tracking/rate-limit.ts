import 'server-only';

import { Redis } from '@upstash/redis';

import { RateLimitError } from '@/server/errors/app-error';
import { getRedisEnvironment } from '@/server/env';

const WINDOW_SECONDS = 60;
const MAXIMUM_REQUESTS_PER_WINDOW = 60;

type MemoryRateLimitEntry = Readonly<{
  count: number;
  expiresAt: number;
}>;

type TrackingRateLimitGlobal = typeof globalThis & {
  trackingRateLimitEntries?: Map<string, MemoryRateLimitEntry>;
};

const rateLimitGlobal = globalThis as TrackingRateLimitGlobal;

function makeRateLimitKey(origin: string, bucket: string): string {
  return `tracking:${bucket}:${encodeURIComponent(origin)}`;
}

function enforceMemoryRateLimit(origin: string, bucket: string): void {
  const entries =
    rateLimitGlobal.trackingRateLimitEntries ?? new Map<string, MemoryRateLimitEntry>();
  rateLimitGlobal.trackingRateLimitEntries = entries;

  const key = makeRateLimitKey(origin, bucket);
  const now = Date.now();
  const existing = entries.get(key);
  const entry =
    !existing || existing.expiresAt <= now
      ? { count: 1, expiresAt: now + WINDOW_SECONDS * 1_000 }
      : { ...existing, count: existing.count + 1 };

  entries.set(key, entry);

  if (entry.count > MAXIMUM_REQUESTS_PER_WINDOW) {
    throw new RateLimitError('Too many tracking requests. Please try again shortly.');
  }
}

async function enforceRedisRateLimit(origin: string, bucket: string): Promise<void> {
  const environment = getRedisEnvironment();
  const redis = new Redis({
    token: environment.UPSTASH_REDIS_REST_TOKEN,
    url: environment.UPSTASH_REDIS_REST_URL,
  });
  const key = makeRateLimitKey(origin, bucket);
  const count = await redis.incr(key);

  if (count === 1) {
    await redis.expire(key, WINDOW_SECONDS);
  }

  if (count > MAXIMUM_REQUESTS_PER_WINDOW) {
    throw new RateLimitError('Too many tracking requests. Please try again shortly.');
  }
}

export async function enforceTrackingRateLimit(origin: string, bucket: string): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    await enforceRedisRateLimit(origin, bucket);
    return;
  }

  enforceMemoryRateLimit(origin, bucket);
}

export async function enforceTrackingBootstrapRateLimit(origin: string): Promise<void> {
  await enforceTrackingRateLimit(origin, 'bootstrap');
}
