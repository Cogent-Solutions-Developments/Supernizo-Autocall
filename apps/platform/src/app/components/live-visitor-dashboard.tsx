'use client';

import { createRealtime } from '@upstash/realtime/client';
import Link from 'next/link';
import { WorkspaceSelect } from './workspace-select';
import { useRouter } from 'next/navigation';
import { dashboardHref } from '@/lib/dashboard-navigation';
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { z } from 'zod';

import {
  ChatThreadSchema,
  VisitorPresenceSnapshotSchema,
  type ChatInboxThread,
  type SiteSettings,
  type VisitorPresenceSnapshot,
} from '@supernizo/shared';

import { fetchAppApi } from '@/lib/app-fetch';

import {
  defaultLiveVisitorFilters,
  displayPath,
  filterAndSortLiveVisitors,
  mergeLiveVisitorEvent,
  stableTimeText,
  type LiveVisitorFilters,
} from './live-visitor-state';
import { DashboardChatInbox } from './dashboard-chat-inbox';
import { LiveVisitorCallModal } from './live-visitor-call-modal';

type ClientRealtimeSchema = {
  visitor: {
    offline: z.ZodObject<{ visitorId: z.ZodString }>;
    online: z.ZodObject<{ visitor: typeof VisitorPresenceSnapshotSchema }>;
    updated: z.ZodObject<{ visitor: typeof VisitorPresenceSnapshotSchema }>;
  };
};

const { useRealtime } = createRealtime<ClientRealtimeSchema>();
const LiveResponseSchema = z.object({ data: z.array(VisitorPresenceSnapshotSchema) });
const ChatThreadResponseSchema = z.object({ data: ChatThreadSchema });

type LiveVisitorDashboardProps = Readonly<{
  canSendChat: boolean;
  initialSiteId: string | undefined;
  initialVisitors: VisitorPresenceSnapshot[];
  sites: SiteSettings[];
}>;

function formatSeconds(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`;
}

function subscribeToHydration(): () => void {
  return () => undefined;
}

function LocalTime({ value }: Readonly<{ value: string }>) {
  const hydrated = useSyncExternalStore(
    subscribeToHydration,
    () => true,
    () => false,
  );
  const date = new Date(value);
  const text =
    hydrated && !Number.isNaN(date.getTime()) ? date.toLocaleTimeString() : stableTimeText(value);

  return <time dateTime={value}>{text}</time>;
}

function updateFilter(
  filters: LiveVisitorFilters,
  key: keyof LiveVisitorFilters,
  value: string,
): LiveVisitorFilters {
  return { ...filters, [key]: value };
}

export function LiveVisitorDashboard({
  canSendChat,
  initialSiteId,
  initialVisitors,
  sites,
}: LiveVisitorDashboardProps) {
  const router = useRouter();
  const siteId = initialSiteId ?? '';
  const [visitors, setVisitors] = useState(initialVisitors);
  const [filters, setFilters] = useState(defaultLiveVisitorFilters);
  const [loadError, setLoadError] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const [inboxInstance, setInboxInstance] = useState(0);
  const [inboxThread, setInboxThread] = useState<ChatInboxThread | null>(null);
  const [callRequest, setCallRequest] = useState<Readonly<{
    type: 'AUDIO' | 'VIDEO';
    visitor: VisitorPresenceSnapshot;
  }> | null>(null);

  const { status } = useRealtime({
    channels: siteId ? [`site:${siteId}`] : [],
    events: ['visitor.online', 'visitor.updated', 'visitor.offline'],
    onData: ({ data, event }) => {
      setVisitors((current) =>
        mergeLiveVisitorEvent(
          current,
          event === 'visitor.offline'
            ? { type: event, visitorId: data.visitorId }
            : { type: event, visitor: data.visitor },
        ),
      );
    },
  });

  useEffect(() => {
    if (!siteId) {
      return;
    }

    let active = true;
    const refresh = () => {
      void fetchAppApi(`/api/dashboard/sites/${siteId}/live`, {
        credentials: 'same-origin',
      })
        .then(async (response) => {
          if (!response.ok) throw new Error('Live visitors could not be loaded.');
          return LiveResponseSchema.parse(await response.json());
        })
        .then((response) => {
          if (active) {
            setVisitors(response.data);
            setLoadError(false);
          }
        })
        .catch(() => active && setLoadError(true));
    };

    if (siteId !== initialSiteId) {
      refresh();
    }
    const interval = window.setInterval(refresh, 60_000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [initialSiteId, siteId]);

  const visibleVisitors = useMemo(
    () => filterAndSortLiveVisitors(visitors, filters),
    [filters, visitors],
  );
  const isRealtimeConnected = status === 'connected';
  const realtimeLabel = isRealtimeConnected
    ? 'Live'
    : status === 'connecting'
      ? 'Connecting'
      : 'Reconnecting';
  const countries = useMemo(
    () =>
      Array.from(
        new Set(visitors.flatMap((visitor) => (visitor.country ? [visitor.country] : []))),
      ).sort(),
    [visitors],
  );

  async function openDashboardChat(visitor: VisitorPresenceSnapshot): Promise<void> {
    setChatError(null);
    try {
      const response = await fetchAppApi('/api/chat/threads', {
        body: JSON.stringify({ siteId, visitorId: visitor.visitorId }),
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        method: 'POST',
      });
      if (!response.ok) throw new Error('The chat could not be opened.');
      const parsed = ChatThreadResponseSchema.parse(await response.json());
      setInboxThread({
        ...parsed.data,
        lastMessageAt: null,
        lastMessagePreview: null,
        visitorLabel:
          [visitor.city, visitor.country]
            .filter((value): value is string => Boolean(value))
            .join(', ') || `Visitor #${visitor.visitorId.slice(-6)}`,
      });
      setInboxInstance((current) => current + 1);
    } catch {
      setChatError('The chat could not be opened.');
    }
  }
  const sources = useMemo(
    () =>
      Array.from(
        new Set(visitors.flatMap((visitor) => (visitor.source ? [visitor.source] : []))),
      ).sort(),
    [visitors],
  );

  return (
    <section className="workspace-panel">
      <div className="workspace-data-toolbar">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-light text-strong">Visitor activity</h2>
            <div className="mt-1 flex items-center gap-2 text-sm text-muted">
              <span>{visibleVisitors.length} online</span>
              <span aria-hidden="true" className="text-slate-300">
                ·
              </span>
              <span
                className={`inline-flex items-center gap-1.5 text-xs font-medium ${
                  isRealtimeConnected ? 'text-emerald-300' : 'text-sky-300'
                }`}
                role="status"
              >
                <span
                  aria-hidden="true"
                  className={`h-1.5 w-1.5 rounded-full ${
                    isRealtimeConnected ? 'bg-emerald-400' : 'animate-pulse bg-sky-500'
                  }`}
                />
                {realtimeLabel}
              </span>
            </div>
          </div>
          <label className="flex min-w-0 items-center gap-2 text-sm font-medium text-body">
            Site
            <WorkspaceSelect
              aria-label="Site"
              className="ml-2"
              value={siteId}
              onValueChange={(next) => {
                setInboxThread(null);
                router.replace(dashboardHref('/dashboard/live', next), { scroll: false });
              }}
              options={sites.map((site) => ({ value: site.id, label: site.name }))}
            />
          </label>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <WorkspaceSelect
            aria-label="Country"
            value={filters.country}
            onValueChange={(next) =>
              setFilters((current) => updateFilter(current, 'country', next))
            }
            options={[
              { value: 'all', label: 'All countries' },
              ...countries.map((country) => ({ value: country, label: country })),
            ]}
          />
          <input
            aria-label="Current page"
            className="workspace-filter"
            onChange={(event) =>
              setFilters((current) => updateFilter(current, 'page', event.target.value))
            }
            placeholder="Current page"
            value={filters.page}
          />
          <WorkspaceSelect
            aria-label="Visitor type"
            value={filters.returning}
            onValueChange={(next) =>
              setFilters((current) => updateFilter(current, 'returning', next))
            }
            options={[
              { value: 'all', label: 'New & Returning' },
              { value: 'new', label: 'New visitors' },
              { value: 'returning', label: 'Returning visitors' },
            ]}
          />
          <WorkspaceSelect
            aria-label="Source"
            value={filters.source}
            onValueChange={(next) => setFilters((current) => updateFilter(current, 'source', next))}
            options={[
              { value: 'all', label: 'All sources' },
              ...sources.map((source) => ({ value: source, label: source })),
            ]}
          />
          <input
            aria-label="Search visitors"
            className="workspace-filter"
            onChange={(event) =>
              setFilters((current) => updateFilter(current, 'search', event.target.value))
            }
            placeholder="Search"
            value={filters.search}
          />
        </div>
      </div>
      {loadError ? (
        <p className="m-5 rounded-lg bg-rose-400/10 p-3 text-sm text-rose-300">
          Live visitor data could not be refreshed.
        </p>
      ) : null}
      {chatError ? (
        <p className="m-5 rounded-lg bg-rose-400/10 p-3 text-sm text-rose-300">{chatError}</p>
      ) : null}
      <div className="workspace-table-scroll hidden lg:block">
        <table className="workspace-table min-w-[980px]">
          <thead>
            <tr>
              <th className="px-6 py-4">Score</th>
              <th className="px-4 py-4">Visitor / location</th>
              <th className="px-4 py-4">Current page</th>
              <th className="px-4 py-4">Active</th>
              <th className="px-4 py-4">Source</th>
              <th className="px-4 py-4">Device</th>
              <th className="px-4 py-4">Last activity</th>
              <th className="px-6 py-4">Action</th>
            </tr>
          </thead>
          <tbody>
            {visibleVisitors.map((visitor) => (
              <tr className="group" key={visitor.visitorId}>
                <td className="px-6 py-4 font-semibold text-strong">
                  {visitor.intentScore ?? '—'}
                </td>
                <td className="px-4 py-4">
                  <span
                    className="mr-2 inline-block h-2 w-2 rounded-full bg-emerald-400"
                    aria-label="Online"
                  />
                  {visitor.city ?? 'Unknown city'}, {visitor.country ?? '—'}
                  <p className="mt-1 text-xs text-muted">
                    {visitor.returningVisitCount > 1
                      ? `Returning · ${visitor.returningVisitCount} visits`
                      : 'New visitor'}
                  </p>
                </td>
                <td className="px-4 py-4 font-medium text-strong">
                  {displayPath(visitor.currentUrl)}
                </td>
                <td className="px-4 py-4 tabular-nums">
                  {formatSeconds(visitor.activeDurationSeconds)}
                </td>
                <td className="px-4 py-4">{visitor.source ?? 'Direct'}</td>
                <td className="px-4 py-4">
                  {visitor.deviceType ?? visitor.browserName ?? 'Unknown'}
                </td>
                <td className="px-4 py-4 text-muted">
                  <LocalTime value={visitor.lastSeenAt} />
                </td>
                <td className="px-6 py-4">
                  <div className="flex items-center gap-2">
                    <Link
                      className="workspace-row-action"
                      href={`/dashboard/visitors/${visitor.visitorId}?siteId=${siteId}`}
                    >
                      Open
                    </Link>
                    <button
                      className="workspace-row-action workspace-row-action-primary"
                      disabled={!canSendChat}
                      onClick={() => void openDashboardChat(visitor)}
                      title={
                        canSendChat ? 'Start chat' : 'Viewer accounts cannot send chat messages'
                      }
                      type="button"
                    >
                      Chat
                    </button>
                    <button
                      className="workspace-row-action"
                      disabled={!canSendChat}
                      onClick={() => setCallRequest({ type: 'AUDIO', visitor })}
                      type="button"
                    >
                      Audio Call
                    </button>
                    <button
                      className="workspace-row-action"
                      disabled={!canSendChat}
                      onClick={() => setCallRequest({ type: 'VIDEO', visitor })}
                      type="button"
                    >
                      Video Call
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="grid gap-3 p-5 lg:hidden">
        {visibleVisitors.map((visitor) => (
          <article className="workspace-record p-4" key={visitor.visitorId}>
            <div className="flex justify-between gap-3">
              <p className="font-semibold">{displayPath(visitor.currentUrl)}</p>
              <span>{visitor.intentScore ?? '—'}</span>
            </div>
            <p className="mt-2 text-sm text-muted">
              {visitor.city ?? 'Unknown city'}, {visitor.country ?? '—'} ·{' '}
              {visitor.source ?? 'Direct'}
            </p>
            <p className="mt-1 text-sm text-muted">
              Active {formatSeconds(visitor.activeDurationSeconds)} ·{' '}
              {visitor.deviceType ?? 'Unknown device'}
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Link
                className="workspace-row-action"
                href={`/dashboard/visitors/${visitor.visitorId}?siteId=${siteId}`}
              >
                Open
              </Link>
              <button
                className="workspace-row-action workspace-row-action-primary"
                disabled={!canSendChat}
                onClick={() => void openDashboardChat(visitor)}
                title={canSendChat ? 'Start chat' : 'Viewer accounts cannot send chat messages'}
                type="button"
              >
                Chat
              </button>
              <button
                className="workspace-row-action"
                disabled={!canSendChat}
                onClick={() => setCallRequest({ type: 'AUDIO', visitor })}
                type="button"
              >
                Audio Call
              </button>
              <button
                className="workspace-row-action"
                disabled={!canSendChat}
                onClick={() => setCallRequest({ type: 'VIDEO', visitor })}
                type="button"
              >
                Video Call
              </button>
            </div>
          </article>
        ))}
      </div>
      {visibleVisitors.length === 0 ? (
        <p className="workspace-table-empty">No live visitors match the current filters.</p>
      ) : null}
      {callRequest ? (
        <LiveVisitorCallModal
          callType={callRequest.type}
          canCall={canSendChat}
          onClose={() => setCallRequest(null)}
          siteId={siteId}
          visitor={callRequest.visitor}
        />
      ) : null}
      {canSendChat && siteId ? (
        <DashboardChatInbox
          canSend={canSendChat}
          initialThread={inboxThread}
          key={`${siteId}:${inboxInstance}`}
          siteId={siteId}
        />
      ) : null}
    </section>
  );
}
