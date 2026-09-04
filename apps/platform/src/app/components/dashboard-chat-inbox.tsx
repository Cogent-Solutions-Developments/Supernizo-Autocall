'use client';

import { createRealtime } from '@upstash/realtime/client';
import { ChatCircleDotsIcon, MinusIcon, UserCircleIcon } from '@phosphor-icons/react';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { z } from 'zod';

import { ChatInboxThreadSchema, ChatMessageSchema, type ChatInboxThread } from '@supernizo/shared';

import { fetchAppApi } from '@/lib/app-fetch';

import { DashboardChatPane } from './dashboard-chat-pane';

const { useRealtime } = createRealtime<{
  chat: {
    incoming: z.ZodObject<{
      message: typeof ChatMessageSchema;
      visitorId: z.ZodType<string>;
    }>;
  };
}>();

const ChatInboxResponseSchema = z.object({
  data: z.object({ threads: z.array(ChatInboxThreadSchema) }),
});

type DashboardChatInboxProps = Readonly<{
  canSend: boolean;
  initialThread?: ChatInboxThread | null;
  siteId: string;
}>;

function subscribeToHydration(): () => void {
  return () => undefined;
}

function incomingThread(
  message: z.infer<typeof ChatMessageSchema>,
  visitorId: string,
  siteId: string,
  existing: ChatInboxThread | undefined,
): ChatInboxThread {
  return {
    id: message.threadId,
    lastMessageAt: message.sentAt,
    lastMessagePreview: message.content,
    siteId: existing?.siteId ?? siteId,
    visitorId,
    visitorLabel: existing?.visitorLabel ?? `Visitor #${visitorId.slice(-6)}`,
  };
}

export function DashboardChatInbox({
  canSend,
  initialThread = null,
  siteId,
}: DashboardChatInboxProps) {
  const [isOpen, setIsOpen] = useState(Boolean(initialThread));
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(
    initialThread?.id ?? null,
  );
  const [threads, setThreads] = useState<ChatInboxThread[]>(initialThread ? [initialThread] : []);
  const hydrated = useSyncExternalStore(
    subscribeToHydration,
    () => true,
    () => false,
  );

  useRealtime({
    channels: [`site:${siteId}`],
    events: ['chat.incoming'],
    onData: ({ data }) => {
      setThreads((current) => {
        const existing = current.find((thread) => thread.id === data.message.threadId);
        const updated = incomingThread(data.message, data.visitorId, siteId, existing);
        return [updated, ...current.filter((thread) => thread.id !== updated.id)];
      });
      setSelectedThreadId(data.message.threadId);
      setIsOpen(true);
    },
  });

  useEffect(() => {
    let active = true;
    void fetchAppApi(`/api/chat/threads?siteId=${encodeURIComponent(siteId)}`, {
      credentials: 'same-origin',
    })
      .then(async (response) => {
        if (!response.ok) throw new Error('Recent chats could not be loaded.');
        return ChatInboxResponseSchema.parse(await response.json());
      })
      .then((response) => {
        if (!active) return;
        setLoadError(null);
        setThreads(response.data.threads);
        setSelectedThreadId((current) =>
          current && response.data.threads.some((thread) => thread.id === current)
            ? current
            : (response.data.threads[0]?.id ?? null),
        );
      })
      .catch(() => active && setLoadError('Recent chats could not be loaded.'));

    return () => {
      active = false;
    };
  }, [siteId]);

  const selectedThread = threads.find((thread) => thread.id === selectedThreadId) ?? null;

  if (!hydrated) return null;

  if (!isOpen) {
    return createPortal(
      <button
        aria-label="Open visitor chat inbox"
        className="fixed right-4 bottom-4 z-40 flex h-14 items-center gap-2 rounded-full bg-[#18181b] px-4 text-sm font-semibold text-white shadow-[0_16px_36px_rgba(24,24,27,0.25)] transition hover:bg-[#27272a] sm:right-6 sm:bottom-6"
        onClick={() => setIsOpen(true)}
        type="button"
      >
        <ChatCircleDotsIcon aria-hidden="true" size={20} weight="fill" />
        Chats{threads.length ? ` (${threads.length})` : ''}
      </button>,
      document.body,
    );
  }

  return createPortal(
    <section
      aria-label="Visitor chat inbox"
      className="fixed right-4 bottom-4 z-40 flex h-[min(32rem,calc(100dvh-2rem))] w-[calc(100vw-2rem)] max-w-[390px] flex-col overflow-hidden rounded-[22px] border border-black/10 bg-[#fbfbfa] shadow-[0_24px_68px_rgba(24,24,27,0.24),0_3px_12px_rgba(24,24,27,0.12)] sm:right-6 sm:bottom-6"
    >
      <header className="flex items-center justify-between gap-3 px-4 pt-4 pb-2.5 text-[#18181b]">
        <div className="flex min-w-0 items-center gap-3">
          <UserCircleIcon
            aria-hidden="true"
            className="shrink-0 text-[#18181b]"
            size={40}
            weight="fill"
          />
          <div className="min-w-0">
            <label className="sr-only" htmlFor="dashboard-chat-thread">
              Select a recent visitor chat
            </label>
            <select
              className="w-full max-w-[220px] truncate border-0 bg-transparent p-0 text-[15px] font-semibold tracking-[-0.025em] text-[#18181b] outline-none"
              id="dashboard-chat-thread"
              onChange={(event) => setSelectedThreadId(event.target.value || null)}
              value={selectedThread?.id ?? ''}
            >
              <option disabled value="">
                Select a chat
              </option>
              {threads.map((thread) => (
                <option key={thread.id} value={thread.id}>
                  {thread.visitorLabel}
                </option>
              ))}
            </select>
            <p className="mt-1 text-[10px] font-medium text-[#85858d]">
              Recent visitor conversations
            </p>
          </div>
        </div>
        <button
          aria-label="Minimize visitor chat inbox"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-black/[0.06] bg-white/70 text-[0] text-[#71717a] shadow-[0_1px_2px_rgba(24,24,27,0.04)] transition hover:bg-white hover:text-[#18181b]"
          onClick={() => setIsOpen(false)}
          type="button"
        >
          <MinusIcon aria-hidden="true" className="text-[#71717a]" size={16} weight="bold" />−
        </button>
      </header>
      {selectedThread ? (
        <DashboardChatPane
          canSend={canSend}
          embedded
          initialThreadId={selectedThread.id}
          key={selectedThread.id}
          siteId={selectedThread.siteId}
          visitorId={selectedThread.visitorId}
        />
      ) : (
        <div className="grid flex-1 place-items-center p-6 text-center text-sm text-[#71717a]">
          {loadError ?? 'Select a recent chat to reply.'}
        </div>
      )}
    </section>,
    document.body,
  );
}
