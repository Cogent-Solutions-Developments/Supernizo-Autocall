import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  AGENT_PRESENCE_TTL_SECONDS,
  InMemoryAgentPresenceRepository,
} from './agent-presence-repository';

afterEach(() => vi.useRealTimers());

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
