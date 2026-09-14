'use client';

import { createRealtime } from '@upstash/realtime/client';
import { Bell, CalendarDays, MessageCircle, PhoneCall, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { z } from 'zod';

import {
  CallSchema,
  DashboardNotificationSchema,
  type Call,
  type DashboardNotification,
} from '@supernizo/shared';

import { fetchAppApi } from '@/lib/app-fetch';
import { dashboardNotificationHref } from '@/lib/notification-navigation';

import {
  markDashboardNotificationRead,
  mergeDashboardNotification,
  unreadNotificationCount,
} from './notification-state';
import { IncomingCallModal } from './incoming-call-modal';

const { useRealtime } = createRealtime<{
  notification: {
    created: z.ZodObject<{ notification: typeof DashboardNotificationSchema }>;
  };
}>();

const NotificationListResponseSchema = z.object({
  data: z.object({ notifications: z.array(DashboardNotificationSchema) }),
});
const CallResponseSchema = z.object({ data: CallSchema });

type DashboardNotificationCenterProps = Readonly<{
  initialNotifications: DashboardNotification[];
  userId: string;
}>;

export function DashboardNotificationCenter({
  initialNotifications,
  userId,
}: DashboardNotificationCenterProps) {
  const router = useRouter();
  const [notifications, setNotifications] = useState(initialNotifications);
  const [isOpen, setIsOpen] = useState(false);
  const [eventFilter, setEventFilter] = useState('all');
  const [toast, setToast] = useState<DashboardNotification | null>(null);
  const [queuedToastCount, setQueuedToastCount] = useState(0);
  const [toastPaused, setToastPaused] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [incomingCall, setIncomingCall] = useState<Call | null>(null);
  const seenIds = useRef(new Set(initialNotifications.map(({ id }) => id)));
  const toastRef = useRef<DashboardNotification | null>(null);
  const originalTitle = useRef<string | null>(null);

  useRealtime({
    channels: [`user:${userId}`],
    events: ['notification.created'],
    onData: ({ data }) => {
      const incoming = data.notification;
      if (!seenIds.current.has(incoming.id)) {
        seenIds.current.add(incoming.id);
        if (toastRef.current) setQueuedToastCount((current) => current + 1);
        toastRef.current = incoming;
        setToast(incoming);
      }
      setNotifications((current) => mergeDashboardNotification(current, incoming));
    },
  });

  useEffect(() => {
    let active = true;
    let refreshing = false;

    const refresh = async (): Promise<void> => {
      if (refreshing) return;
      refreshing = true;
      try {
        const response = await fetchAppApi('/api/notifications?limit=50', {
          credentials: 'same-origin',
        });
        if (!response.ok) throw new Error('Notifications could not be refreshed.');
        const { data } = NotificationListResponseSchema.parse(await response.json());
        if (!active) return;
        for (const notification of data.notifications) {
          if (!seenIds.current.has(notification.id)) {
            seenIds.current.add(notification.id);
            if (toastRef.current) setQueuedToastCount((current) => current + 1);
            toastRef.current = notification;
            setToast(notification);
          }
        }
        setNotifications((current) =>
          data.notifications.reduce(
            (merged, notification) => mergeDashboardNotification(merged, notification),
            current,
          ),
        );
        setLoadError(null);
      } catch {
        if (active) setLoadError('Notifications could not be refreshed.');
      } finally {
        refreshing = false;
      }
    };

    void refresh();
    const interval = window.setInterval(() => void refresh(), 5_000);

    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    if (!toast || toastPaused) return;
    const timeout = window.setTimeout(() => {
      toastRef.current = null;
      setToast(null);
      setQueuedToastCount(0);
      setToastPaused(false);
    }, 6_000);
    return () => window.clearTimeout(timeout);
  }, [toast, toastPaused]);

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

  function markNotificationRead(notification: DashboardNotification): void {
    if (notification.readAt) return;

    const readAt = new Date().toISOString();
    setNotifications((current) => markDashboardNotificationRead(current, notification.id, readAt));
    void fetchAppApi(`/api/notifications/${notification.id}`, {
      body: JSON.stringify({ read: true }),
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      method: 'PATCH',
    })
      .then((response) => {
        if (!response.ok) throw new Error('Notification could not be marked as read.');
      })
      .catch(() => {
        setNotifications((current) =>
          current.map((item) =>
            item.id === notification.id ? { ...item, readAt: notification.readAt } : item,
          ),
        );
        setLoadError('The notification could not be marked as read.');
      });
  }

  async function openNotification(notification: DashboardNotification): Promise<void> {
    setIsOpen(false);
    toastRef.current = null;
    setToast(null);
    setQueuedToastCount(0);
    setToastPaused(false);
    markNotificationRead(notification);

    if (notification.type === 'INCOMING_CALL' && notification.callId) {
      try {
        const response = await fetchAppApi(`/api/calls/${notification.callId}`, {
          credentials: 'same-origin',
        });
        if (!response.ok) throw new Error('Incoming call could not be loaded.');
        setIncomingCall(CallResponseSchema.parse(await response.json()).data);
      } catch {
        setLoadError('Incoming call could not be loaded.');
      }
      return;
    }

    router.push(dashboardNotificationHref(notification));
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
          aria-label={`Open ${toast.type === 'INCOMING_CALL' ? 'incoming call' : 'chat'} with ${toast.visitorLabel} from ${toast.siteName}`}
          className="fixed top-24 left-1/2 z-[60] w-[min(25rem,calc(100vw-2rem))] -translate-x-1/2 rounded-[1.4rem] border border-line/90 bg-surface/95 p-3.5 text-left shadow-[0_20px_60px_rgba(0,0,0,0.5)] ring-1 ring-white/5 backdrop-blur-xl transition hover:-translate-y-0.5 hover:bg-surface-hover"
          onClick={() => void openNotification(toast)}
          onBlur={() => setToastPaused(false)}
          onFocus={() => setToastPaused(true)}
          onMouseEnter={() => setToastPaused(true)}
          onMouseLeave={() => setToastPaused(false)}
          type="button"
        >
          <span className="flex items-start gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-full bg-action/15 text-accent ring-1 ring-accent/20">
              {toast.type === 'INCOMING_CALL' ? (
                <PhoneCall aria-hidden="true" size={18} />
              ) : (
                <MessageCircle aria-hidden="true" size={18} />
              )}
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center justify-between gap-3 text-xs font-semibold text-accent">
                <span className="truncate">
                  {toast.type === 'INCOMING_CALL' ? 'Incoming call' : 'New message'} ·{' '}
                  {toast.siteName}
                </span>
                {queuedToastCount ? (
                  <span className="shrink-0 rounded-full bg-surface-muted px-2 py-0.5 text-[10px] text-body">
                    +{queuedToastCount} new
                  </span>
                ) : null}
              </span>
              <span className="mt-1.5 block truncate text-sm font-semibold text-strong">
                {toast.visitorLabel}
              </span>
              <span className="mt-0.5 block truncate text-sm text-muted">{toast.preview}</span>
            </span>
          </span>
        </button>
      ) : null}
      {incomingCall ? (
        <IncomingCallModal call={incomingCall} onClose={() => setIncomingCall(null)} />
      ) : null}
    </div>
  );
}
