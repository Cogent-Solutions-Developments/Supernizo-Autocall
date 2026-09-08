import { describe, expect, it } from 'vitest';

import { currentEventAssignments, updateEventAssignment } from './access-management-state';

describe('event assignment state', () => {
  it('adds and removes an event without duplicating assignments', () => {
    expect(updateEventAssignment(['event-2'], 'event-1', true)).toEqual(['event-1', 'event-2']);
    expect(updateEventAssignment(['event-1', 'event-2'], 'event-1', false)).toEqual(['event-2']);
  });

  it('lists each current Supernizo agent and event assignment', () => {
    const agent = {
      createdAt: '2026-09-08T00:00:00.000Z',
      displayName: 'Priya',
      email: 'priya@example.com',
      eligibility: 'ELIGIBLE' as const,
      id: 'agent-1',
      lastSyncedAt: '2026-09-08T00:00:00.000Z',
      role: 'AGENT' as const,
      siteIds: ['event-2', 'event-1'],
      source: 'SUPERNIZO' as const,
      updatedAt: '2026-09-08T00:00:00.000Z',
    };
    const localAgent = {
      ...agent,
      id: 'local-agent',
      source: 'LOCAL' as const,
    };

    expect(
      currentEventAssignments(
        [agent, localAgent],
        [
          { id: 'event-1', name: 'Annual conference' },
          { id: 'event-2', name: 'Product launch' },
        ],
      ),
    ).toEqual([
      { agent, event: { id: 'event-1', name: 'Annual conference' } },
      { agent, event: { id: 'event-2', name: 'Product launch' } },
    ]);
  });
});
