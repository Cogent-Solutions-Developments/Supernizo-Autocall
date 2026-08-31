import { afterEach, describe, expect, it, vi } from 'vitest';

import { InMemoryPresenceRepository, PRESENCE_TTL_SECONDS } from './presence-repository';

const snapshot = {
  activeDurationSeconds: 15,
  anonymousVisitorId: '11111111-1111-4111-8111-111111111111',
  browserName: 'Chrome',
  city: 'Doha',
  country: 'QA',
  currentUrl: 'https://example.com/pricing',
  deviceType: 'DESKTOP',
  intentScore: null,
  lastSeenAt: '2026-08-31T12:00:00.000Z',
  returningVisitCount: 1,
  sessionId: '22222222-2222-4222-8222-222222222222',
  siteId: 'site-a',
  source: 'LinkedIn',
  visitorId: 'visitor-a',
} as const;

afterEach(() => vi.useRealTimers());

describe('InMemoryPresenceRepository', () => {
  it('writes presence with first-online detection and lists by site', async () => {
    const repository = new InMemoryPresenceRepository();

    await expect(repository.upsert(snapshot)).resolves.toEqual({ wasOnline: false });
    await expect(repository.upsert(snapshot)).resolves.toEqual({ wasOnline: true });
    await expect(repository.listBySite('site-a')).resolves.toEqual([snapshot]);
    await expect(repository.listBySite('site-b')).resolves.toEqual([]);
  });

  it('removes expired entries when listing a site', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-31T12:00:00.000Z'));
    const repository = new InMemoryPresenceRepository();

    await repository.upsert(snapshot);
    vi.advanceTimersByTime((PRESENCE_TTL_SECONDS + 1) * 1_000);

    await expect(repository.listBySite(snapshot.siteId)).resolves.toEqual([]);
  });
});
