import { afterEach, describe, expect, it, vi } from 'vitest';

import { getRedisClient } from '@/server/redis/client';

import {
  AGENT_PRESENCE_TTL_SECONDS,
  InMemoryAgentPresenceRepository,
  RedisAgentPresenceRepository,
} from './agent-presence-repository';

vi.mock('@/server/redis/client', () => ({ getRedisClient: vi.fn() }));

afterEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
});

describe('InMemoryAgentPresenceRepository', () => {
  it('expires an unavailable agent state instead of leaving it stale', async () => {
    vi.useFakeTimers();
    const repository = new InMemoryAgentPresenceRepository();
    await repository.set('agent-a', 'BUSY');

    expect((await repository.get('agent-a'))?.availability).toBe('BUSY');
    vi.advanceTimersByTime((AGENT_PRESENCE_TTL_SECONDS + 1) * 1_000);
    await expect(repository.get('agent-a')).resolves.toBeNull();
  });
});

describe('RedisAgentPresenceRepository', () => {
  it('maps Redis write failures to a service-unavailable error', async () => {
    const set = vi.fn().mockRejectedValue(new TypeError('fetch failed'));
    vi.mocked(getRedisClient).mockReturnValue({
      set,
    } as unknown as ReturnType<typeof getRedisClient>);

    await expect(
      new RedisAgentPresenceRepository().set('agent-a', 'AVAILABLE'),
    ).rejects.toMatchObject({
      code: 'service_unavailable',
      message: 'Agent presence is temporarily unavailable.',
      statusCode: 503,
    });
  });

  it('maps Redis read failures to a service-unavailable error', async () => {
    const get = vi.fn().mockRejectedValue(new TypeError('fetch failed'));
    vi.mocked(getRedisClient).mockReturnValue({
      get,
    } as unknown as ReturnType<typeof getRedisClient>);

    await expect(new RedisAgentPresenceRepository().get('agent-a')).rejects.toMatchObject({
      code: 'service_unavailable',
      message: 'Agent presence is temporarily unavailable.',
      statusCode: 503,
    });
  });
});
