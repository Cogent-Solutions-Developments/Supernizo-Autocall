'use client';

import { createRealtime } from '@upstash/realtime/client';
import Link from 'next/link';
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
  const [siteId, setSiteId] = useState(initialSiteId ?? '');
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
    <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold text-slate-950">Live visitors</h2>
            <div className="mt-1 flex items-center gap-2 text-sm text-slate-600">
              <span>{visibleVisitors.length} online</span>
              <span aria-hidden="true" className="text-slate-300">
                ·
              </span>
              <span
                className={`inline-flex items-center gap-1.5 text-xs font-medium ${
                  isRealtimeConnected ? 'text-emerald-700' : 'text-sky-700'
                }`}
                role="status"
              >
                <span
                  aria-hidden="true"
                  className={`h-1.5 w-1.5 rounded-full ${
                    isRealtimeConnected ? 'bg-emerald-500' : 'animate-pulse bg-sky-500'
                  }`}
                />
                {realtimeLabel}
              </span>
            </div>
          </div>
          <label className="text-sm font-medium text-slate-700">
            Site
            <select
              aria-label="Site"
              className="ml-2 rounded-lg border border-slate-300 bg-white px-3 py-2"
              onChange={(event) => {
                setInboxThread(null);
                setSiteId(event.target.value);
              }}
              value={siteId}
            >
              {sites.map((site) => (
                <option key={site.id} value={site.id}>
                  {site.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <select
            aria-label="Country"
            className="rounded-lg border border-slate-300 px-3 py-2"
            onChange={(event) =>
              setFilters((current) => updateFilter(current, 'country', event.target.value))
            }
            value={filters.country}
          >
            <option value="all">All countries</option>
            {countries.map((country) => (
              <option key={country} value={country}>
                {country}
              </option>
            ))}
          </select>
          <input
            aria-label="Current page"
            className="rounded-lg border border-slate-300 px-3 py-2"
            onChange={(event) =>
              setFilters((current) => updateFilter(current, 'page', event.target.value))
            }
            placeholder="Current page"
            value={filters.page}
          />
          <select
            aria-label="Visitor type"
            className="rounded-lg border border-slate-300 px-3 py-2"
            onChange={(event) =>
              setFilters((current) => updateFilter(current, 'returning', event.target.value))
            }
            value={filters.returning}
          >
            <option value="all">New & returning</option>
            <option value="new">New visitors</option>
            <option value="returning">Returning visitors</option>
          </select>
          <select
            aria-label="Source"
            className="rounded-lg border border-slate-300 px-3 py-2"
            onChange={(event) =>
              setFilters((current) => updateFilter(current, 'source', event.target.value))
            }
            value={filters.source}
          >
            <option value="all">All sources</option>
            {sources.map((source) => (
              <option key={source} value={source}>
                {source}
              </option>
            ))}
          </select>
          <input
            aria-label="Search visitors"
            className="rounded-lg border border-slate-300 px-3 py-2"
            onChange={(event) =>
              setFilters((current) => updateFilter(current, 'search', event.target.value))
            }
            placeholder="Search"
            value={filters.search}
          />
        </div>
      </div>
      {loadError ? (
        <p className="m-5 rounded-lg bg-rose-50 p-3 text-sm text-rose-700">
          Live visitor data could not be refreshed.
        </p>
      ) : null}
      {chatError ? (
        <p className="m-5 rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{chatError}</p>
      ) : null}
      <div className="hidden overflow-x-auto lg:block">
        <table className="w-full min-w-[980px] text-left text-sm">
          <thead className="bg-slate-50 text-xs tracking-wide text-slate-500 uppercase">
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
              <tr className="border-t border-slate-100" key={visitor.visitorId}>
                <td className="px-6 py-4 font-semibold text-slate-950">
                  {visitor.intentScore ?? '—'}
                </td>
                <td className="px-4 py-4">
                  <span
                    className="mr-2 inline-block h-2 w-2 rounded-full bg-emerald-500"
                    aria-label="Online"
                  />
                  {visitor.city ?? 'Unknown city'}, {visitor.country ?? '—'}
                  <p className="mt-1 text-xs text-slate-500">
                    {visitor.returningVisitCount > 1
                      ? `Returning · ${visitor.returningVisitCount} visits`
                      : 'New visitor'}
                  </p>
                </td>
                <td className="px-4 py-4 font-medium text-slate-800">
                  {displayPath(visitor.currentUrl)}
                </td>
                <td className="px-4 py-4 tabular-nums">
                  {formatSeconds(visitor.activeDurationSeconds)}
                </td>
                <td className="px-4 py-4">{visitor.source ?? 'Direct'}</td>
                <td className="px-4 py-4">
                  {visitor.deviceType ?? visitor.browserName ?? 'Unknown'}
                </td>
                <td className="px-4 py-4 text-slate-500">
                  <LocalTime value={visitor.lastSeenAt} />
                </td>
                <td className="px-6 py-4">
                  <div className="flex items-center gap-2">
                    <Link
                      className="rounded-md border border-slate-300 px-3 py-1.5 font-medium text-slate-700 hover:bg-slate-50"
                      href={`/dashboard/visitors/${visitor.visitorId}?siteId=${siteId}`}
                    >
                      Open
                    </Link>
                    <button
                      className="rounded-md bg-slate-950 px-3 py-1.5 font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500"
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
                      className="rounded-md border border-slate-300 px-3 py-1.5 font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                      disabled={!canSendChat}
                      onClick={() => setCallRequest({ type: 'AUDIO', visitor })}
                      type="button"
                    >
                      Audio Call
                    </button>
                    <button
                      className="rounded-md border border-slate-300 px-3 py-1.5 font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
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
          <article className="rounded-xl border border-slate-200 p-4" key={visitor.visitorId}>
            <div className="flex justify-between gap-3">
              <p className="font-semibold">{displayPath(visitor.currentUrl)}</p>
              <span>{visitor.intentScore ?? '—'}</span>
            </div>
            <p className="mt-2 text-sm text-slate-600">
              {visitor.city ?? 'Unknown city'}, {visitor.country ?? '—'} ·{' '}
              {visitor.source ?? 'Direct'}
            </p>
            <p className="mt-1 text-sm text-slate-600">
              Active {formatSeconds(visitor.activeDurationSeconds)} ·{' '}
              {visitor.deviceType ?? 'Unknown device'}
            </p>
            <button
              className="mt-3 rounded-md bg-slate-950 px-3 py-1.5 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500"
              disabled={!canSendChat}
              onClick={() => void openDashboardChat(visitor)}
              type="button"
            >
              Chat
            </button>
          </article>
        ))}
      </div>
      {visibleVisitors.length === 0 ? (
        <p className="p-8 text-center text-sm text-slate-600">
          No live visitors match the current filters.
        </p>
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
