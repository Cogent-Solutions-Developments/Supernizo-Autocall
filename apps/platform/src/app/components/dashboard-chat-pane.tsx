'use client';

import { createRealtime } from '@upstash/realtime/client';
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
    if (!threadId || !content.trim()) return;

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
          ? 'flex min-h-0 flex-1 flex-col bg-[#fbfbfa] text-[#18181b]'
          : 'rounded-xl border border-slate-200 bg-white p-5 shadow-sm'
      }
    >
      {!embedded ? (
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-semibold text-slate-950">Chat</h2>
          {threadId ? (
            <button
              className="text-sm font-medium text-blue-700 hover:text-blue-800"
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
            className="mt-4 rounded-lg bg-slate-950 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
            onClick={() => void startChat()}
            type="button"
          >
            Start chat
          </button>
        ) : (
          <p className="mt-3 text-sm text-slate-600">No chat thread has been started.</p>
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
                : 'max-h-72 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50/80 p-4'
            }
          >
            {messages.length ? (
              <ol className="grid list-none gap-4 p-0">
                {messages.map((message) => {
                  if (message.senderType === 'SYSTEM') {
                    return (
                      <li className="text-center text-xs text-slate-500" key={message.id}>
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
                          className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-blue-100 text-xs font-bold text-blue-700"
                        >
                          V
                        </span>
                      ) : null}
                      <article
                        className={`flex max-w-[82%] flex-col ${
                          isVisitor ? 'items-start' : 'items-end'
                        }`}
                      >
                        <div
                          className={`mb-1 flex items-center gap-2 px-1 text-[10px] font-medium ${
                            isVisitor ? 'text-[#85858d]' : 'justify-end text-[#85858d]'
                          }`}
                        >
                          <span>{senderName}</span>
                          <time className="font-normal text-slate-400" dateTime={message.sentAt}>
                            {formatMessageTime(message.sentAt)}
                          </time>
                        </div>
                        <div
                          className={`border px-3.5 py-2.5 text-[13px] leading-[1.5] shadow-[0_1px_2px_rgba(24,24,27,0.04)] ${
                            isVisitor
                              ? embedded
                                ? 'rounded-[13px] rounded-bl-[4px] border-black/[0.07] bg-white/80 text-[#27272a] backdrop-blur-md'
                                : 'rounded-2xl rounded-tl-sm border border-blue-200 bg-blue-50 text-slate-900'
                              : embedded
                                ? 'rounded-[13px] rounded-br-[4px] border-[#18181b] bg-[#18181b] text-white'
                                : 'rounded-2xl rounded-tr-sm bg-slate-900 text-white'
                          }`}
                        >
                          <p className="whitespace-pre-wrap break-words">{message.content}</p>
                        </div>
                      </article>
                      {!isVisitor ? (
                        <span
                          aria-hidden="true"
                          className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-slate-900 text-xs font-bold text-white"
                        >
                          A
                        </span>
                      ) : null}
                    </li>
                  );
                })}
              </ol>
            ) : (
              <p className="text-slate-600">No messages yet.</p>
            )}
            <div ref={messageEndRef} />
          </div>
          {canSend ? (
            <form
              className={
                embedded
                  ? 'grid gap-2 border-t border-black/[0.06] bg-gradient-to-t from-[#fbfbfa] via-[#fbfbfa] to-transparent px-3.5 pt-3 pb-3'
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
                    ? 'min-h-16 border-black/10 bg-white/90 text-[#18181b] shadow-[0_8px_28px_rgba(24,24,27,0.08)] placeholder:text-[#a1a1aa]'
                    : 'min-h-20 border-slate-300'
                }`}
                id={`chat-${threadId}`}
                maxLength={2000}
                onChange={(event) => setContent(event.target.value)}
                placeholder="Write a message"
                value={content}
              />
              <button
                className={`w-fit rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-60 ${
                  embedded ? 'bg-[#18181b] hover:bg-[#3f3f46]' : 'bg-slate-950'
                }`}
                disabled={isSending || !content.trim()}
                type="submit"
              >
                Send
              </button>
            </form>
          ) : (
            <p className="mt-3 text-sm text-slate-600">Viewers have read-only chat access.</p>
          )}
        </div>
      ) : null}
      {error ? <p className="mt-3 text-sm text-rose-700">{error}</p> : null}
    </article>
  );
}
