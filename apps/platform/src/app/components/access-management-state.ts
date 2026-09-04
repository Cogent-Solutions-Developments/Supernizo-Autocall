import type { AccessUser } from '@supernizo/shared';

export type AccessUserGroups = Readonly<{
  administrators: AccessUser[];
  agents: AccessUser[];
}>;

export function partitionAccessUsers(users: readonly AccessUser[]): AccessUserGroups {
  return users.reduce<AccessUserGroups>(
    (groups, user) => {
      if (user.role === 'AGENT') {
        groups.agents.push(user);
      } else {
        groups.administrators.push(user);
      }

      return groups;
    },
    { administrators: [], agents: [] },
  );
}

export function toggleSiteId(
  siteIds: readonly string[],
  siteId: string,
  checked: boolean,
): string[] {
  return checked
    ? Array.from(new Set([...siteIds, siteId])).sort()
    : siteIds.filter((candidate) => candidate !== siteId);
}
