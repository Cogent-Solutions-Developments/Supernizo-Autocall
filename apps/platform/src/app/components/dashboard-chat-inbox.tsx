'use client';

import { createRealtime } from '@upstash/realtime/client';
import {
  MessageCircle as ChatCircleDotsIcon,
  X,
  ArrowLeft,
  Search,
  CircleUserRound as UserCircleIcon,
} from 'lucide-react';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
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
  const launcherRef = useRef<HTMLButtonElement>(null);
  const [search, setSearch] = useState('');
  const [mobileConversation, setMobileConversation] = useState(Boolean(initialThread));
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
      setMobileConversation(true);
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

  const visibleThreads = threads.filter((thread) =>
    `${thread.visitorLabel} ${thread.lastMessagePreview ?? ''}`
      .toLocaleLowerCase()
      .includes(search.trim().toLocaleLowerCase()),
  );

  function closeInbox(): void {
    setIsOpen(false);
    requestAnimationFrame(() => launcherRef.current?.focus());
  }

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
        requestAnimationFrame(() => launcherRef.current?.focus());
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen]);

  if (!hydrated) return null;

  if (!isOpen) {
    return createPortal(
      <button
        ref={launcherRef}
        aria-label="Open visitor chat inbox"
        className="workspace-theme staff-chat fixed right-4 bottom-24 z-40 flex h-14 items-center gap-2 rounded-full bg-action px-4 text-sm font-semibold text-white shadow-[0_16px_36px_rgba(24,24,27,0.25)] transition hover:bg-action-hover sm:right-6 sm:bottom-6"
        onClick={() => setIsOpen(true)}
        type="button"
      >
        <ChatCircleDotsIcon aria-hidden="true" size={20} />
        Chats{threads.length ? ` (${threads.length})` : ''}
      </button>,
      document.body,
    );
  }

  return createPortal(
    <section
      aria-label="Visitor chat inbox"
      role="dialog"
      className="workspace-theme staff-chat fixed right-3 bottom-24 z-40 flex h-[min(40rem,calc(100dvh-7rem))] w-[calc(100vw-1.5rem)] max-w-[860px] flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-[0_24px_68px_rgba(0,0,0,0.4)] sm:right-6 sm:bottom-6 sm:h-[min(40rem,calc(100dvh-3rem))] sm:w-[calc(100vw-3rem)]"
    >
      <header className="flex shrink-0 items-center justify-between border-b border-line px-4 py-3 text-strong">
        <div className="flex items-center gap-2.5">
          <ChatCircleDotsIcon aria-hidden="true" size={21} />
          <h2 className="text-base font-semibold">Chats</h2>
          <span className="text-xs text-muted">{threads.length}</span>
        </div>
        <button
          aria-label="Close visitor chat inbox"
          className="grid size-10 place-items-center rounded-full text-body transition hover:bg-surface-hover hover:text-white"
          onClick={closeInbox}
          type="button"
        >
          <X aria-hidden="true" size={20} />
        </button>
      </header>
      <div className="flex min-h-0 flex-1">
        <aside
          aria-label="Conversations"
          className={`${mobileConversation ? 'hidden sm:flex' : 'flex'} min-h-0 w-full shrink-0 flex-col border-r border-line sm:w-[34%] sm:max-w-[280px]`}
        >
          <label className="mx-3 my-3 flex items-center gap-2 rounded-xl border border-line bg-surface-muted/50 px-3 py-2.5 text-muted">
            <Search aria-hidden="true" size={16} className="shrink-0" />
            <span className="sr-only">Search conversations</span>
            <input
              className="min-w-0 w-full bg-transparent text-sm text-strong outline-none placeholder:text-muted"
              placeholder="Search conversations"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>
          {loadError ? <p className="px-4 pb-3 text-xs text-rose-300">{loadError}</p> : null}
          <div className="min-h-0 flex-1 overflow-y-auto">
            {visibleThreads.length ? (
              <ul>
                {visibleThreads.map((thread) => (
                  <li key={thread.id}>
                    <button
                      aria-current={selectedThreadId === thread.id ? 'true' : undefined}
                      className={`flex w-full items-center gap-3 border-b border-line/40 px-3 py-4 text-left transition hover:bg-surface-hover ${selectedThreadId === thread.id ? 'bg-action/15' : ''}`}
                      onClick={() => {
                        setSelectedThreadId(thread.id);
                        setMobileConversation(true);
                      }}
                      type="button"
                    >
                      <UserCircleIcon
                        aria-hidden="true"
                        className="shrink-0 text-accent"
                        size={36}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-strong">
                          {thread.visitorLabel}
                        </span>
                        <span className="mt-1 block truncate text-xs text-muted">
                          {thread.lastMessagePreview || 'No messages yet'}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-4 py-6 text-center text-sm text-muted">
                {search ? 'No matching conversations.' : 'No conversations yet.'}
              </p>
            )}
          </div>
        </aside>
        <div
          className={`${mobileConversation ? 'flex' : 'hidden sm:flex'} min-h-0 min-w-0 flex-1 flex-col`}
        >
          {selectedThread ? (
            <>
              <div className="flex shrink-0 items-center gap-3 border-b border-line px-4 py-3">
                <button
                  aria-label="Back to conversations"
                  className="grid size-10 shrink-0 place-items-center rounded-full text-body hover:bg-surface-hover sm:hidden"
                  onClick={() => setMobileConversation(false)}
                  type="button"
                >
                  <ArrowLeft aria-hidden="true" size={20} />
                </button>
                <UserCircleIcon aria-hidden="true" className="shrink-0 text-accent" size={34} />
                <div className="min-w-0">
                  <h3 className="truncate text-sm font-semibold text-strong">
                    {selectedThread.visitorLabel}
                  </h3>
                  <p className="mt-0.5 text-xs text-muted">Visitor conversation</p>
                </div>
              </div>
              <DashboardChatPane
                canSend={canSend}
                embedded
                initialThreadId={selectedThread.id}
                key={selectedThread.id}
                siteId={selectedThread.siteId}
                visitorId={selectedThread.visitorId}
              />
            </>
          ) : (
            <div className="grid flex-1 place-items-center p-6 text-center text-sm text-muted">
              Select a conversation to start chatting.
            </div>
          )}
        </div>
      </div>
    </section>,
    document.body,
  );
}
