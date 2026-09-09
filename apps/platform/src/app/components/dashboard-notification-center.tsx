'use client';

import { createRealtime } from '@upstash/realtime/client';
import { Bell, CalendarDays, MessageCircle, X } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { z } from 'zod';

import { DashboardNotificationSchema, type DashboardNotification } from '@supernizo/shared';

import { fetchAppApi } from '@/lib/app-fetch';

import { DashboardChatPane } from './dashboard-chat-pane';
import {
  markDashboardNotificationRead,
  mergeDashboardNotification,
  unreadNotificationCount,
} from './notification-state';

const { useRealtime } = createRealtime<{
  notification: {
    created: z.ZodObject<{ notification: typeof DashboardNotificationSchema }>;
  };
}>();

const NotificationListResponseSchema = z.object({
  data: z.object({ notifications: z.array(DashboardNotificationSchema) }),
});

type DashboardNotificationCenterProps = Readonly<{
  canSend: boolean;
  initialNotifications: DashboardNotification[];
  userId: string;
}>;

export function DashboardNotificationCenter({
  canSend,
  initialNotifications,
  userId,
}: DashboardNotificationCenterProps) {
  const [notifications, setNotifications] = useState(initialNotifications);
  const [isOpen, setIsOpen] = useState(false);
  const [activeNotification, setActiveNotification] = useState<DashboardNotification | null>(null);
  const [eventFilter, setEventFilter] = useState('all');
  const [toast, setToast] = useState<DashboardNotification | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const seenIds = useRef(new Set(initialNotifications.map(({ id }) => id)));
  const originalTitle = useRef<string | null>(null);

  const { status } = useRealtime({
    channels: [`user:${userId}`],
    events: ['notification.created'],
    onData: ({ data }) => {
      const incoming = data.notification;
      if (!seenIds.current.has(incoming.id)) {
        seenIds.current.add(incoming.id);
        setToast(incoming);
      }
      setNotifications((current) => mergeDashboardNotification(current, incoming));
    },
  });

  useEffect(() => {
    if (status !== 'connected') return;
    let active = true;

    void fetchAppApi('/api/notifications?limit=50', { credentials: 'same-origin' })
      .then(async (response) => {
        if (!response.ok) throw new Error('Notifications could not be refreshed.');
        return NotificationListResponseSchema.parse(await response.json());
      })
      .then(({ data }) => {
        if (!active) return;
        for (const notification of data.notifications) seenIds.current.add(notification.id);
        setNotifications((current) =>
          data.notifications.reduce(
            (merged, notification) => mergeDashboardNotification(merged, notification),
            current,
          ),
        );
        setLoadError(null);
      })
      .catch(() => active && setLoadError('Notifications could not be refreshed.'));

    return () => {
      active = false;
    };
  }, [status]);

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(null), 6_000);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  const unreadCount = unreadNotificationCount(notifications);
  useEffect(() => {
    originalTitle.current ??= document.title;
    document.title = unreadCount
      ? `(${unreadCount}) ${originalTitle.current}`
      : originalTitle.current;
    return () => {
      if (originalTitle.current) document.title = originalTitle.current;
    };
  }, [unreadCount]);

  const events = useMemo(
    () =>
      Array.from(new Map(notifications.map(({ siteId, siteName }) => [siteId, siteName]))).sort(
        (left, right) => left[1].localeCompare(right[1]),
      ),
    [notifications],
  );
  const visibleNotifications = notifications.filter(
    (notification) => eventFilter === 'all' || notification.siteId === eventFilter,
  );

  async function openNotification(notification: DashboardNotification): Promise<void> {
    setActiveNotification({
      ...notification,
      readAt: notification.readAt ?? new Date().toISOString(),
    });
    setIsOpen(false);
    setToast(null);
    if (notification.readAt) return;

    const readAt = new Date().toISOString();
    setNotifications((current) => markDashboardNotificationRead(current, notification.id, readAt));
    try {
      const response = await fetchAppApi(`/api/notifications/${notification.id}`, {
        body: JSON.stringify({ read: true }),
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        method: 'PATCH',
      });
      if (!response.ok) throw new Error('Notification could not be marked as read.');
    } catch {
      setNotifications((current) =>
        current.map((item) =>
          item.id === notification.id ? { ...item, readAt: notification.readAt } : item,
        ),
      );
      setLoadError('The notification could not be marked as read.');
    }
  }

  return (
    <div className="relative">
      <button
        aria-expanded={isOpen}
        aria-label={`Notifications${unreadCount ? `, ${unreadCount} unread` : ''}`}
        className="relative grid size-10 place-items-center rounded-full border border-line bg-surface-muted text-body transition hover:bg-surface-hover hover:text-white"
        onClick={() => setIsOpen((current) => !current)}
        type="button"
      >
        <Bell aria-hidden="true" size={19} />
        {unreadCount ? (
          <span className="absolute -top-1 -right-1 grid min-h-5 min-w-5 place-items-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        ) : null}
      </button>

      {isOpen ? (
        <section
          aria-label="Notifications"
          className="absolute top-12 right-0 z-50 flex max-h-[min(34rem,calc(100dvh-6rem))] w-[min(24rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-[0_24px_68px_rgba(0,0,0,0.45)]"
        >
          <header className="flex items-center justify-between border-b border-line px-4 py-3">
            <div>
              <h2 className="font-semibold text-strong">Notifications</h2>
              <p className="text-xs text-muted">{unreadCount} unread</p>
            </div>
            <button
              aria-label="Close notifications"
              className="grid size-9 place-items-center rounded-full text-muted hover:bg-surface-hover hover:text-white"
              onClick={() => setIsOpen(false)}
              type="button"
            >
              <X aria-hidden="true" size={18} />
            </button>
          </header>
          {events.length > 1 ? (
            <label className="border-b border-line px-4 py-3 text-xs text-muted">
              Event
              <select
                className="ml-2 rounded-lg border border-line bg-surface-muted px-2 py-1.5 text-sm text-strong"
                onChange={(event) => setEventFilter(event.target.value)}
                value={eventFilter}
              >
                <option value="all">All events</option>
                {events.map(([siteId, siteName]) => (
                  <option key={siteId} value={siteId}>
                    {siteName}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          {loadError ? <p className="px-4 py-2 text-xs text-rose-300">{loadError}</p> : null}
          <div className="min-h-0 overflow-y-auto">
            {visibleNotifications.length ? (
              <ul>
                {visibleNotifications.map((notification) => (
                  <li className="border-b border-line/50" key={notification.id}>
                    <button
                      className={`w-full px-4 py-3 text-left transition hover:bg-surface-hover ${notification.readAt ? '' : 'bg-action/10'}`}
                      onClick={() => void openNotification(notification)}
                      type="button"
                    >
                      <span className="flex items-center gap-1.5 text-xs font-semibold text-accent">
                        <CalendarDays aria-hidden="true" size={13} />
                        {notification.siteName}
                      </span>
                      <span className="mt-1 block text-sm font-semibold text-strong">
                        {notification.visitorLabel}
                      </span>
                      <span className="mt-1 block truncate text-sm text-muted">
                        {notification.preview}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-4 py-8 text-center text-sm text-muted">No notifications.</p>
            )}
          </div>
        </section>
      ) : null}

      {toast ? (
        <button
          className="fixed top-24 right-4 z-[60] w-[min(22rem,calc(100vw-2rem))] rounded-2xl border border-line bg-surface p-4 text-left shadow-[0_20px_60px_rgba(0,0,0,0.45)] transition hover:bg-surface-hover sm:right-6"
          onClick={() => void openNotification(toast)}
          type="button"
        >
          <span className="flex items-center gap-2 text-xs font-semibold text-accent">
            <MessageCircle aria-hidden="true" size={15} />
            New message · {toast.siteName}
          </span>
          <span className="mt-2 block text-sm font-semibold text-strong">{toast.visitorLabel}</span>
          <span className="mt-1 block truncate text-sm text-muted">{toast.preview}</span>
        </button>
      ) : null}

      {activeNotification ? (
        <section
          aria-label={`Chat with ${activeNotification.visitorLabel}`}
          role="dialog"
          className="fixed right-3 bottom-24 z-[55] flex h-[min(40rem,calc(100dvh-7rem))] w-[calc(100vw-1.5rem)] max-w-[32rem] flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-[0_24px_68px_rgba(0,0,0,0.5)] sm:right-6 sm:bottom-6"
        >
          <header className="flex shrink-0 items-start justify-between gap-3 border-b border-line px-4 py-3">
            <div className="min-w-0">
              <h2 className="truncate font-semibold text-strong">
                {activeNotification.visitorLabel}
              </h2>
              <p className="mt-1 flex items-center gap-1.5 truncate text-xs font-medium text-accent">
                <CalendarDays aria-hidden="true" size={13} />
                Event: {activeNotification.siteName}
              </p>
              <Link
                className="mt-1 inline-block text-xs text-muted underline hover:text-strong"
                href={`/dashboard/live?siteId=${encodeURIComponent(activeNotification.siteId)}`}
              >
                View event
              </Link>
            </div>
            <button
              aria-label="Close chat"
              className="grid size-9 shrink-0 place-items-center rounded-full text-muted hover:bg-surface-hover hover:text-white"
              onClick={() => setActiveNotification(null)}
              type="button"
            >
              <X aria-hidden="true" size={18} />
            </button>
          </header>
          <DashboardChatPane
            canSend={canSend}
            embedded
            initialThreadId={activeNotification.threadId}
            key={activeNotification.threadId}
            siteId={activeNotification.siteId}
            visitorId={activeNotification.visitorId}
          />
        </section>
      ) : null}
    </div>
  );
}
