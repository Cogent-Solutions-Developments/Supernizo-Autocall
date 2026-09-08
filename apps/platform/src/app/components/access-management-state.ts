import type { AccessSite, AccessUser } from '@supernizo/shared';

export type EventAssignmentRecord = Readonly<{
  agent: AccessUser;
  event: AccessSite;
}>;

export function updateEventAssignment(
  siteIds: readonly string[],
  siteId: string,
  assigned: boolean,
): string[] {
  return assigned
    ? Array.from(new Set([...siteIds, siteId])).sort()
    : siteIds.filter((candidate) => candidate !== siteId);
}

export function currentEventAssignments(
  users: readonly AccessUser[],
  sites: readonly AccessSite[],
): EventAssignmentRecord[] {
  const eventsById = new Map(sites.map((event) => [event.id, event]));

  return users
    .filter((user) => user.source === 'SUPERNIZO' && user.role === 'AGENT')
    .flatMap((agent) =>
      agent.siteIds.flatMap((siteId) => {
        const event = eventsById.get(siteId);
        return event ? [{ agent, event }] : [];
      }),
    )
    .sort(
      (left, right) =>
        left.event.name.localeCompare(right.event.name) ||
        (left.agent.displayName ?? left.agent.email).localeCompare(
          right.agent.displayName ?? right.agent.email,
        ),
    );
}
