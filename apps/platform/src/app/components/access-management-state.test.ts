import { describe, expect, it } from 'vitest';

import type { AccessUser } from '@supernizo/shared';

import { partitionAccessUsers, toggleSiteId } from './access-management-state';

function accessUser(
  id: string,
  role: AccessUser['role'],
  siteIds: readonly string[] = [],
): AccessUser {
  return {
    createdAt: '2026-09-04T00:00:00.000Z',
    displayName: id,
    email: `${id}@example.com`,
    id,
    role,
    siteIds: [...siteIds],
    updatedAt: '2026-09-04T00:00:00.000Z',
  };
}

describe('access management state', () => {
  it('includes every agent, including agents without site access', () => {
    const unassignedAgent = accessUser('agent-unassigned', 'AGENT');
    const assignedAgent = accessUser('agent-assigned', 'AGENT', ['site-1']);
    const administrator = accessUser('administrator', 'ADMIN');

    expect(partitionAccessUsers([unassignedAgent, administrator, assignedAgent])).toEqual({
      administrators: [administrator],
      agents: [unassignedAgent, assignedAgent],
    });
  });

  it('adds and removes site access without duplicating assignments', () => {
    expect(toggleSiteId(['site-2'], 'site-1', true)).toEqual(['site-1', 'site-2']);
    expect(toggleSiteId(['site-1', 'site-2'], 'site-1', false)).toEqual(['site-2']);
  });
});
