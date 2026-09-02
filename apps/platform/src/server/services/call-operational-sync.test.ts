import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  callCount: vi.fn(),
  callEventCreate: vi.fn(),
  callFindUnique: vi.fn(),
  markAgentBusy: vi.fn(),
  releaseAgent: vi.fn(),
  transactionCallFindUnique: vi.fn(),
  transactionCallUpdateMany: vi.fn(),
  visitorFindUnique: vi.fn(),
}));

vi.mock('@/server/db/client', () => ({
  getDatabaseClient: () => ({
    call: { count: mocks.callCount, findUnique: mocks.callFindUnique },
    visitor: { findUnique: mocks.visitorFindUnique },
    $transaction: async (operation: (transaction: unknown) => Promise<unknown>) =>
      operation({
        call: {
          findUnique: mocks.transactionCallFindUnique,
          updateMany: mocks.transactionCallUpdateMany,
        },
        callEvent: { create: mocks.callEventCreate },
      }),
  }),
}));
vi.mock('@/server/env', () => ({ getEnvironmentReadiness: () => ({ realtime: false }) }));
vi.mock('@/server/presence/presence-repository', () => ({ getPresenceRepository: vi.fn() }));
vi.mock('@/server/realtime', () => ({ UpstashRealtimeProvider: vi.fn() }));
vi.mock('./agent-presence-service', () => ({
  assertAgentCanStartCall: vi.fn(),
  markAgentBusy: mocks.markAgentBusy,
  releaseAgent: mocks.releaseAgent,
}));
vi.mock('./tracker-engagement-service', () => ({ resolveTrackingContext: vi.fn() }));

import { transitionCall } from './call-service';

const selectedCall = {
  agent: { displayName: 'Agent' },
  agentId: 'agent_123',
  failureCode: null,
  id: 'call_123',
  requestedAt: new Date('2026-09-02T07:24:00.000Z'),
  roomName: 'call_room',
  sessionId: 'session_123',
  site: { widgetAvatarUrl: null },
  siteId: 'site_123',
  status: 'ACTIVE',
  type: 'AUDIO',
  visitorId: 'visitor_123',
} as const;

describe('deferred call operational synchronization', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.callFindUnique
      .mockResolvedValueOnce(selectedCall)
      .mockResolvedValueOnce({ ...selectedCall, status: 'ENDED' });
    mocks.transactionCallUpdateMany.mockResolvedValue({ count: 1 });
    mocks.transactionCallFindUnique.mockResolvedValue({ ...selectedCall, status: 'ENDED' });
    mocks.callEventCreate.mockResolvedValue({ id: 'event_123' });
    mocks.callCount.mockResolvedValue(0);
    mocks.visitorFindUnique.mockResolvedValue(null);
  });

  it('returns after the durable transition and defers presence/realtime work', async () => {
    let scheduledTask: (() => Promise<void>) | undefined;
    const scheduler = vi.fn((task: () => Promise<void>) => {
      scheduledTask = task;
    });

    const result = await transitionCall('call_123', 'end', undefined, {
      scheduleOperationalSync: scheduler,
    });

    expect(result.status).toBe('ENDED');
    expect(scheduler).toHaveBeenCalledOnce();
    expect(mocks.releaseAgent).not.toHaveBeenCalled();
    expect(mocks.callFindUnique).toHaveBeenCalledOnce();

    if (!scheduledTask) throw new Error('The operational sync was not scheduled.');
    await scheduledTask();

    expect(mocks.releaseAgent).toHaveBeenCalledWith('agent_123');
    expect(mocks.callFindUnique).toHaveBeenCalledTimes(2);
  });
});
