import type { VisitorPresenceSnapshot } from '@supernizo/shared';

export type LiveVisitorEvent =
  | Readonly<{ type: 'visitor.online' | 'visitor.updated'; visitor: VisitorPresenceSnapshot }>
  | Readonly<{ type: 'visitor.offline'; visitorId: string }>;

export type LiveVisitorFilters = Readonly<{
  country: string;
  page: string;
  returning: 'all' | 'new' | 'returning';
  search: string;
  source: string;
}>;

export const defaultLiveVisitorFilters: LiveVisitorFilters = {
  country: 'all',
  page: '',
  returning: 'all',
  search: '',
  source: 'all',
};

export function stableTimeText(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Unknown' : `${date.toISOString().slice(11, 19)} UTC`;
}

export function mergeLiveVisitorEvent(
  visitors: readonly VisitorPresenceSnapshot[],
  event: LiveVisitorEvent,
): VisitorPresenceSnapshot[] {
  if (event.type === 'visitor.offline') {
    return visitors.filter((visitor) => visitor.visitorId !== event.visitorId);
  }

  return [
    event.visitor,
    ...visitors.filter((visitor) => visitor.visitorId !== event.visitor.visitorId),
  ];
}

function pathFromUrl(url: string | null): string {
  if (!url) {
    return '';
  }

  try {
    const parsedUrl = new URL(url);
    return `${parsedUrl.pathname}${parsedUrl.search}`;
  } catch {
    return url;
  }
}

export function filterAndSortLiveVisitors(
  visitors: readonly VisitorPresenceSnapshot[],
  filters: LiveVisitorFilters,
): VisitorPresenceSnapshot[] {
  const search = filters.search.trim().toLocaleLowerCase();
  const page = filters.page.trim().toLocaleLowerCase();

  return visitors
    .filter((visitor) => {
      const currentPath = pathFromUrl(visitor.currentUrl).toLocaleLowerCase();
      const searchableValues = [
        visitor.city,
        visitor.country,
        visitor.currentUrl,
        visitor.deviceType,
        visitor.source,
      ]
        .filter((value): value is string => Boolean(value))
        .join(' ')
        .toLocaleLowerCase();
      const returningMatches =
        filters.returning === 'all' ||
        (filters.returning === 'new' && visitor.returningVisitCount <= 1) ||
        (filters.returning === 'returning' && visitor.returningVisitCount > 1);

      return (
        (filters.country === 'all' || visitor.country === filters.country) &&
        (filters.source === 'all' || visitor.source === filters.source) &&
        (!page || currentPath.includes(page)) &&
        (!search || searchableValues.includes(search)) &&
        returningMatches
      );
    })
    .sort(
      (left, right) =>
        (right.intentScore ?? 0) - (left.intentScore ?? 0) ||
        right.activeDurationSeconds - left.activeDurationSeconds ||
        right.lastSeenAt.localeCompare(left.lastSeenAt),
    );
}

export function displayPath(url: string | null): string {
  return pathFromUrl(url) || 'Unknown page';
}
