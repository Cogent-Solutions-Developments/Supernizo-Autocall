import { describe, expect, it } from 'vitest';

import { ConflictError, ForbiddenError } from '@/server/errors/app-error';

import { assertManagedRoleChange, assignedSiteIdsForRole } from './access-management-service';

describe('access management policy', () => {
  it('uses memberships only for agents', () => {
    expect(assignedSiteIdsForRole('ADMIN', ['site_2', 'site_1'])).toEqual([]);
    expect(assignedSiteIdsForRole('AGENT', ['site_2', 'site_1', 'site_2'])).toEqual([
      'site_1',
      'site_2',
    ]);
  });

  it('prevents an administrator from demoting their own account', () => {
    expect(() =>
      assertManagedRoleChange({
        actorUserId: 'user_1',
        administratorCount: 2,
        currentRole: 'ADMIN',
        nextRole: 'AGENT',
        targetUserId: 'user_1',
      }),
    ).toThrow(ForbiddenError);
  });

  it('prevents the final administrator from being demoted', () => {
    expect(() =>
      assertManagedRoleChange({
        actorUserId: 'user_1',
        administratorCount: 1,
        currentRole: 'ADMIN',
        nextRole: 'AGENT',
        targetUserId: 'user_2',
      }),
    ).toThrow(ConflictError);
  });

  it('allows an administrator to update agents and other administrators', () => {
    expect(() =>
      assertManagedRoleChange({
        actorUserId: 'user_1',
        administratorCount: 2,
        currentRole: 'AGENT',
        nextRole: 'ADMIN',
        targetUserId: 'user_2',
      }),
    ).not.toThrow();
    expect(() =>
      assertManagedRoleChange({
        actorUserId: 'user_1',
        administratorCount: 2,
        currentRole: 'ADMIN',
        nextRole: 'ADMIN',
        targetUserId: 'user_2',
      }),
    ).not.toThrow();
  });
});
