import { describe, expect, it } from 'vitest';

import type { Call } from '@supernizo/shared';

import { optimisticallyEndCall, shouldIgnoreCallUpdate } from './call-end-state';

const activeCall: Call = {
  agentAvatarUrl: null,
  agentDisplayName: 'Agent',
  id: 'call_123',
  requestedAt: '2026-09-02T07:24:00.000Z',
  roomName: 'call_room',
  siteId: 'site_123',
  status: 'ACTIVE',
  type: 'VIDEO',
  visitorId: 'visitor_123',
};

describe('optimistic call ending', () => {
  it('hides active media immediately without changing call identity', () => {
    expect(optimisticallyEndCall(activeCall)).toEqual({ ...activeCall, status: 'ENDED' });
  });

  it('ignores late realtime updates for the call currently being ended', () => {
    expect(shouldIgnoreCallUpdate('call_123', 'call_123')).toBe(true);
    expect(shouldIgnoreCallUpdate('call_456', 'call_123')).toBe(false);
  });
});
