export function updateEventAssignment(
  siteIds: readonly string[],
  siteId: string,
  assigned: boolean,
): string[] {
  return assigned
    ? Array.from(new Set([...siteIds, siteId])).sort()
    : siteIds.filter((candidate) => candidate !== siteId);
}
