import 'server-only';

import { getRedisClient } from '@/server/redis/client';
import { getEnvironmentReadiness } from '@/server/env';

import type { VisitorPresenceSnapshot } from '@supernizo/shared';

export const PRESENCE_TTL_SECONDS = 45;

export type PresenceWriteResult = Readonly<{
  wasOnline: boolean;
}>;

export interface PresenceRepository {
  get(siteId: string, visitorId: string): Promise<VisitorPresenceSnapshot | null>;
  listBySite(siteId: string): Promise<VisitorPresenceSnapshot[]>;
  upsert(snapshot: VisitorPresenceSnapshot): Promise<PresenceWriteResult>;
}

function snapshotKey(siteId: string, visitorId: string): string {
  return `presence:site:${siteId}:visitor:${visitorId}`;
}

function siteIndexKey(siteId: string): string {
  return `presence:site:${siteId}:visitors`;
}

export class RedisPresenceRepository implements PresenceRepository {
  public async get(siteId: string, visitorId: string): Promise<VisitorPresenceSnapshot | null> {
    return getRedisClient().get<VisitorPresenceSnapshot>(snapshotKey(siteId, visitorId));
  }

  public async listBySite(siteId: string): Promise<VisitorPresenceSnapshot[]> {
    const redis = getRedisClient();
    const indexKey = siteIndexKey(siteId);
    const now = Date.now();
    await redis.zremrangebyscore(indexKey, 0, now);
    const visitorIds = await redis.zrange<string[]>(indexKey, 0, -1);
    if (visitorIds.length === 0) {
      return [];
    }

    const snapshots = await Promise.all(
      visitorIds.map((visitorId) =>
        redis.get<VisitorPresenceSnapshot>(snapshotKey(siteId, visitorId)),
      ),
    );
    const availableSnapshots = snapshots.filter(
      (snapshot): snapshot is VisitorPresenceSnapshot => snapshot !== null,
    );

    return availableSnapshots.sort((left, right) =>
      right.lastSeenAt.localeCompare(left.lastSeenAt),
    );
  }

  public async upsert(snapshot: VisitorPresenceSnapshot): Promise<PresenceWriteResult> {
    const redis = getRedisClient();
    const key = snapshotKey(snapshot.siteId, snapshot.visitorId);
    const wasOnline = (await redis.exists(key)) === 1;
    const expiresAt = Date.now() + PRESENCE_TTL_SECONDS * 1_000;

    await Promise.all([
      redis.set(key, snapshot, { ex: PRESENCE_TTL_SECONDS }),
      redis.zadd(siteIndexKey(snapshot.siteId), {
        score: expiresAt,
        member: snapshot.visitorId,
      }),
      redis.expire(siteIndexKey(snapshot.siteId), 86_400),
    ]);

    return { wasOnline };
  }
}

type MemoryPresenceEntry = Readonly<{
  expiresAt: number;
  snapshot: VisitorPresenceSnapshot;
}>;

export class InMemoryPresenceRepository implements PresenceRepository {
  private readonly entries = new Map<string, MemoryPresenceEntry>();

  public async get(siteId: string, visitorId: string): Promise<VisitorPresenceSnapshot | null> {
    const key = snapshotKey(siteId, visitorId);
    const entry = this.entries.get(key);
    if (!entry || entry.expiresAt <= Date.now()) {
      this.entries.delete(key);
      return null;
    }

    return entry.snapshot;
  }

  public async listBySite(siteId: string): Promise<VisitorPresenceSnapshot[]> {
    const now = Date.now();
    const snapshots: VisitorPresenceSnapshot[] = [];

    for (const [key, entry] of this.entries) {
      if (entry.expiresAt <= now) {
        this.entries.delete(key);
      } else if (entry.snapshot.siteId === siteId) {
        snapshots.push(entry.snapshot);
      }
    }

    return snapshots.sort((left, right) => right.lastSeenAt.localeCompare(left.lastSeenAt));
  }

  public async upsert(snapshot: VisitorPresenceSnapshot): Promise<PresenceWriteResult> {
    const key = snapshotKey(snapshot.siteId, snapshot.visitorId);
    const existingEntry = this.entries.get(key);
    const wasOnline = Boolean(existingEntry && existingEntry.expiresAt > Date.now());
    this.entries.set(key, {
      expiresAt: Date.now() + PRESENCE_TTL_SECONDS * 1_000,
      snapshot,
    });

    return { wasOnline };
  }
}

type PresenceGlobal = typeof globalThis & {
  developmentPresenceRepository?: InMemoryPresenceRepository;
};

const presenceGlobal = globalThis as PresenceGlobal;

export function getPresenceRepository(): PresenceRepository {
  if (process.env.NODE_ENV === 'production' || getEnvironmentReadiness().redis) {
    return new RedisPresenceRepository();
  }

  const repository =
    presenceGlobal.developmentPresenceRepository ?? new InMemoryPresenceRepository();
  presenceGlobal.developmentPresenceRepository = repository;
  return repository;
}
