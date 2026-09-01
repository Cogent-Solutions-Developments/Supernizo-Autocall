'use client';

import { useEffect, useState } from 'react';
import { z } from 'zod';

import { ChatThreadSchema, type VisitorPresenceSnapshot } from '@supernizo/shared';

import { withAppBasePath } from '@/lib/app-path';

import { DashboardChatPane } from './dashboard-chat-pane';

const ChatThreadResponseSchema = z.object({ data: ChatThreadSchema });

type LiveVisitorChatModalProps = Readonly<{
  canSend: boolean;
  onClose: () => void;
  siteId: string;
  visitor: VisitorPresenceSnapshot;
}>;

export function LiveVisitorChatModal({
  canSend,
  onClose,
  siteId,
  visitor,
}: LiveVisitorChatModalProps) {
  const [error, setError] = useState<string | null>(null);
  const [threadId, setThreadId] = useState<string | null>(null);

  useEffect(() => {
    if (!canSend) return;

    let active = true;
    void fetch(withAppBasePath('/api/chat/threads'), {
      body: JSON.stringify({ siteId, visitorId: visitor.visitorId }),
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    })
      .then(async (response) => {
        if (!response.ok) throw new Error('The chat could not be started.');
        return ChatThreadResponseSchema.parse(await response.json());
      })
      .then((response) => {
        if (active) setThreadId(response.data.id);
      })
      .catch(() => active && setError('The chat could not be started.'));

    return () => {
      active = false;
    };
  }, [canSend, siteId, visitor.visitorId]);

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [onClose]);

  return (
    <div
      aria-labelledby="live-chat-title"
      aria-modal="true"
      className="fixed inset-0 z-50 grid place-items-center bg-slate-950/45 p-4"
      role="dialog"
    >
      <section className="w-full max-w-xl rounded-2xl bg-white shadow-2xl">
        <header className="flex items-start justify-between gap-4 border-b border-slate-200 p-5">
          <div>
            <p className="text-sm font-semibold tracking-[0.14em] text-blue-600 uppercase">
              Live chat
            </p>
            <h2 className="mt-1 text-xl font-semibold text-slate-950" id="live-chat-title">
              {visitor.city ?? 'Anonymous visitor'} · {visitor.country ?? 'Unknown location'}
            </h2>
            <p className="mt-1 truncate text-sm text-slate-600">
              {visitor.currentUrl ?? 'Current page unknown'}
            </p>
          </div>
          <button
            aria-label="Close chat"
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-950"
            onClick={onClose}
            type="button"
          >
            ×
          </button>
        </header>
        <div className="p-5">
          {!canSend ? (
            <p className="text-sm text-slate-600">
              Viewer accounts cannot start or send chat messages.
            </p>
          ) : threadId ? (
            <DashboardChatPane
              canSend
              initialThreadId={threadId}
              siteId={siteId}
              visitorId={visitor.visitorId}
            />
          ) : error ? (
            <p className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</p>
          ) : (
            <p className="py-8 text-center text-sm text-slate-600">Opening secure chat…</p>
          )}
        </div>
      </section>
    </div>
  );
}
