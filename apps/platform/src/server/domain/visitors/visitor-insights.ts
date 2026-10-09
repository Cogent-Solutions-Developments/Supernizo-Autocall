import 'server-only';

export type TimelineEntryKind = 'event' | 'page_view';

export type VisitorTimelineEntry = Readonly<{
  activeDurationSeconds: number | null;
  id: string;
  kind: TimelineEntryKind;
  maxScrollPercent: number | null;
  name: string;
  occurredAt: string;
  path: string | null;
  title: string | null;
  type: string;
}>;

export type TimelineCursorValue = Readonly<{
  id: string;
  kind: TimelineEntryKind;
  occurredAt: string;
}>;

const kindOrder: Readonly<Record<TimelineEntryKind, number>> = {
  event: 1,
  page_view: 0,
};

export function compareTimelineEntries(
  left: VisitorTimelineEntry,
  right: VisitorTimelineEntry,
): number {
  const dateOrder = right.occurredAt.localeCompare(left.occurredAt);
  if (dateOrder !== 0) return dateOrder;

  const typeOrder = kindOrder[right.kind] - kindOrder[left.kind];
  if (typeOrder !== 0) return typeOrder;

  return right.id.localeCompare(left.id);
}

export function mergeTimelineEntries(
  pageViews: readonly VisitorTimelineEntry[],
  events: readonly VisitorTimelineEntry[],
  limit: number,
): Readonly<{ entries: VisitorTimelineEntry[]; nextCursor: TimelineCursorValue | null }> {
  const sortedEntries = [...pageViews, ...events].sort(compareTimelineEntries);
  const entries = sortedEntries.slice(0, limit);
  const lastEntry = entries.at(-1);

  return {
    entries,
    nextCursor:
      sortedEntries.length > limit && lastEntry
        ? { id: lastEntry.id, kind: lastEntry.kind, occurredAt: lastEntry.occurredAt }
        : null,
  };
}

export type AnalyticsMetricsInput = Readonly<{
  averageActiveSessionSeconds: number | null;
  newVisitors: number;
  totalVisitors: number;
}>;

export function buildVisitorMetrics(input: AnalyticsMetricsInput): Readonly<{
  averageActiveSessionSeconds: number;
  newVisitors: number;
  returningVisitors: number;
  totalVisitors: number;
}> {
  return {
    averageActiveSessionSeconds: Math.round(input.averageActiveSessionSeconds ?? 0),
    newVisitors: input.newVisitors,
    returningVisitors: Math.max(0, input.totalVisitors - input.newVisitors),
    totalVisitors: input.totalVisitors,
  };
}
