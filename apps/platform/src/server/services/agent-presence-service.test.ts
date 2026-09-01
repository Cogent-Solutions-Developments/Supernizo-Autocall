import { describe, expect, it } from 'vitest';

import { canAgentStartCall } from './agent-presence-service';

describe('agent call concurrency', () => {
  it('only permits an available agent to begin another call', () => {
    expect(canAgentStartCall('AVAILABLE')).toBe(true);
    expect(canAgentStartCall('BUSY')).toBe(false);
    expect(canAgentStartCall('OFFLINE')).toBe(false);
    expect(canAgentStartCall(null)).toBe(true);
  });
});
