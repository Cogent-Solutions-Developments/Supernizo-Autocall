'use client';

import { createRealtime } from '@upstash/realtime/client';
import { Send } from 'lucide-react';
import { FormEvent, useEffect, useRef, useState } from 'react';
import { z } from 'zod';

import { ChatMessageSchema, ChatThreadSchema, type ChatMessage } from '@supernizo/shared';

import { fetchAppApi } from '@/lib/app-fetch';

import { mergeChatMessage } from './chat-state';

const { useRealtime } = createRealtime<{
  chat: { message: z.ZodObject<{ message: typeof ChatMessageSchema }> };
}>();

const ChatHistoryResponseSchema = z.object({
  data: z.object({ messages: z.array(ChatMessageSchema) }),
});
const ChatThreadResponseSchema = z.object({ data: ChatThreadSchema });
const ChatMessageResponseSchema = z.object({ data: ChatMessageSchema });

function formatMessageTime(sentAt: string): string {
  return new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(sentAt));
}

type DashboardChatPaneProps = Readonly<{
  canSend: boolean;
  embedded?: boolean;
  initialThreadId: string | null;
  siteId: string;
  visitorId: string;
}>;

export function DashboardChatPane({
  canSend,
  embedded = false,
  initialThreadId,
  siteId,
  visitorId,
}: DashboardChatPaneProps) {
  const [threadId, setThreadId] = useState(initialThreadId);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [content, setContent] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(Boolean(initialThreadId));
  const [isSending, setIsSending] = useState(false);
  const [unread, setUnread] = useState(0);
  const messageEndRef = useRef<HTMLDivElement>(null);

  useRealtime({
    channels: threadId ? [`chat:${threadId}`] : [],
    events: ['chat.message'],
    onData: ({ data }) => {
      setMessages((current) => mergeChatMessage(current, data.message));
      if (!isOpen) setUnread((current) => current + 1);
    },
  });

  useEffect(() => {
    if (!threadId) return;
    let active = true;
    void fetchAppApi(`/api/chat/threads/${threadId}/messages`, {
      credentials: 'same-origin',
    })
      .then(async (response) => {
        if (!response.ok) throw new Error('Chat history could not be loaded.');
        return ChatHistoryResponseSchema.parse(await response.json());
      })
      .then((response) => {
        if (active) setMessages(response.data.messages);
      })
      .catch(() => active && setError('Chat history could not be loaded.'));
    return () => {
      active = false;
    };
  }, [threadId]);

  useEffect(() => {
    if (isOpen) messageEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [isOpen, messages]);

  async function startChat(): Promise<void> {
    setError(null);
    try {
      const response = await fetchAppApi('/api/chat/threads', {
        body: JSON.stringify({ siteId, visitorId }),
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        method: 'POST',
      });
      if (!response.ok) throw new Error('The chat could not be started.');
      const parsed = ChatThreadResponseSchema.parse(await response.json());
      setThreadId(parsed.data.id);
      setIsOpen(true);
    } catch {
      setError('The chat could not be started.');
    }
  }

  async function sendMessage(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!threadId || !content.trim() || isSending) return;

    setError(null);
    setIsSending(true);
    try {
      const response = await fetchAppApi(`/api/chat/threads/${threadId}/messages`, {
        body: JSON.stringify({ content }),
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        method: 'POST',
      });
      if (!response.ok) throw new Error('The message could not be sent.');
      const parsed = ChatMessageResponseSchema.parse(await response.json());
      setMessages((current) => mergeChatMessage(current, parsed.data));
      setContent('');
    } catch {
      setError('The message could not be sent.');
    } finally {
      setIsSending(false);
    }
  }

  return (
    <article
      className={
        embedded
          ? 'flex min-h-0 min-w-0 flex-1 flex-col bg-surface-muted/35 text-strong'
          : 'rounded-xl border border-line bg-surface-hover p-5 shadow-sm'
      }
    >
      {!embedded ? (
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-semibold text-strong">Chat</h2>
          {threadId ? (
            <button
              className="text-sm font-medium text-accent hover:text-accent"
              onClick={() => {
                setIsOpen((current) => !current);
                setUnread(0);
              }}
              type="button"
            >
              {isOpen ? 'Hide' : `Open${unread ? ` (${unread})` : ''}`}
            </button>
          ) : null}
        </div>
      ) : null}
      {!threadId ? (
        canSend ? (
          <button
            className="mt-4 rounded-lg bg-action px-4 py-2 text-sm font-medium text-white hover:bg-action-hover"
            onClick={() => void startChat()}
            type="button"
          >
            Start chat
          </button>
        ) : (
          <p className="mt-3 text-sm text-muted">No chat thread has been started.</p>
        )
      ) : null}
      {isOpen && threadId ? (
        <div className={embedded ? 'flex min-h-0 flex-1 flex-col' : 'mt-4'}>
          <div
            aria-live="polite"
            aria-relevant="additions text"
            className={
              embedded
                ? 'min-h-0 flex-1 overflow-y-auto px-4 py-3'
                : 'max-h-72 overflow-y-auto rounded-xl border border-line bg-surface-muted/80 p-4'
            }
          >
            {messages.length ? (
              <ol className="grid list-none gap-4 p-0">
                {messages.map((message) => {
                  if (message.senderType === 'SYSTEM') {
                    return (
                      <li className="text-center text-xs text-muted" key={message.id}>
                        {message.content}
                      </li>
                    );
                  }

                  const isVisitor = message.senderType === 'VISITOR';
                  const senderName = message.senderName ?? (isVisitor ? 'Visitor' : 'Support team');
                  return (
                    <li
                      className={`flex gap-2.5 ${isVisitor ? 'justify-start' : 'justify-end'}`}
                      key={message.id}
                    >
                      {isVisitor ? (
                        <span
                          aria-hidden="true"
                          className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-surface-hover text-xs font-bold text-accent"
                        >
                          V
                        </span>
                      ) : null}
                      <article
                        className={`flex min-w-0 max-w-[82%] flex-col ${
                          isVisitor ? 'items-start' : 'items-end'
                        }`}
                      >
                        <div
                          className={`mb-1 flex items-center gap-2 px-1 text-[10px] font-medium ${
                            isVisitor ? 'text-muted' : 'justify-end text-muted'
                          }`}
                        >
                          <span>{senderName}</span>
                          <time className="font-normal text-muted" dateTime={message.sentAt}>
                            {formatMessageTime(message.sentAt)}
                          </time>
                        </div>
                        <div
                          className={`border px-3.5 py-2.5 text-[13px] leading-[1.5] shadow-[0_1px_2px_rgba(24,24,27,0.04)] ${
                            isVisitor
                              ? embedded
                                ? 'rounded-[13px] rounded-bl-[4px] border-line bg-surface-hover/80 text-body backdrop-blur-md'
                                : 'rounded-2xl rounded-tl-sm border border-line bg-surface-hover text-strong'
                              : embedded
                                ? 'rounded-[13px] rounded-br-[4px] border-action bg-action text-white'
                                : 'rounded-2xl rounded-tr-sm bg-action text-white'
                          }`}
                        >
                          <p className="whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
                            {message.content}
                          </p>
                        </div>
                      </article>
                      {!isVisitor ? (
                        <span
                          aria-hidden="true"
                          className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-action text-xs font-bold text-white"
                        >
                          A
                        </span>
                      ) : null}
                    </li>
                  );
                })}
              </ol>
            ) : (
              <p className="text-muted">No messages yet.</p>
            )}
            <div ref={messageEndRef} />
          </div>
          {canSend ? (
            <form
              className={
                embedded
                  ? 'flex items-end gap-2 border-t border-line bg-surface px-3 py-3'
                  : 'mt-3 grid gap-2'
              }
              onSubmit={(event) => void sendMessage(event)}
            >
              <label className="sr-only" htmlFor={`chat-${threadId}`}>
                Message
              </label>
              <textarea
                className={`rounded-lg border p-2 text-sm ${
                  embedded
                    ? 'min-h-11 min-w-0 max-h-32 flex-1 resize-none rounded-2xl border-line bg-surface-hover text-strong placeholder:text-muted'
                    : 'min-h-20 border-slate-300'
                }`}
                id={`chat-${threadId}`}
                maxLength={2000}
                rows={embedded ? 1 : 2}
                onKeyDown={(event) => {
                  if (
                    embedded &&
                    event.key === 'Enter' &&
                    !event.shiftKey &&
                    !event.nativeEvent.isComposing
                  ) {
                    event.preventDefault();
                    if (!isSending && content.trim()) event.currentTarget.form?.requestSubmit();
                  }
                }}
                onChange={(event) => setContent(event.target.value)}
                placeholder="Write a message"
                value={content}
              />
              <button
                aria-label="Send message"
                className={`shrink-0 bg-action text-sm font-medium text-white hover:bg-action-hover disabled:opacity-60 ${
                  embedded
                    ? 'grid size-11 place-items-center rounded-full'
                    : 'w-fit rounded-lg px-4 py-2'
                }`}
                disabled={isSending || !content.trim()}
                type="submit"
              >
                {embedded ? <Send aria-hidden="true" size={19} /> : 'Send'}
              </button>
            </form>
          ) : (
            <p className="mt-3 text-sm text-muted">Viewers have read-only chat access.</p>
          )}
        </div>
      ) : null}
      {error ? <p className="mt-3 text-sm text-rose-300">{error}</p> : null}
    </article>
  );
}
