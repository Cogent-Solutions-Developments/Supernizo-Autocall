'use client';

import { createRealtime } from '@upstash/realtime/client';
import { FormEvent, useEffect, useState } from 'react';
import { z } from 'zod';

import { ChatMessageSchema, ChatThreadSchema, type ChatMessage } from '@supernizo/shared';

import { withAppBasePath } from '@/lib/app-path';

import { mergeChatMessage } from './chat-state';

const { useRealtime } = createRealtime<{
  chat: { message: z.ZodObject<{ message: typeof ChatMessageSchema }> };
}>();

const ChatHistoryResponseSchema = z.object({
  data: z.object({ messages: z.array(ChatMessageSchema) }),
});
const ChatThreadResponseSchema = z.object({ data: ChatThreadSchema });
const ChatMessageResponseSchema = z.object({ data: ChatMessageSchema });

type DashboardChatPaneProps = Readonly<{
  canSend: boolean;
  initialThreadId: string | null;
  siteId: string;
  visitorId: string;
}>;

export function DashboardChatPane({
  canSend,
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
    void fetch(withAppBasePath(`/api/chat/threads/${threadId}/messages`), {
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

  async function startChat(): Promise<void> {
    setError(null);
    try {
      const response = await fetch(withAppBasePath('/api/chat/threads'), {
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
      const response = await fetch(withAppBasePath(`/api/chat/threads/${threadId}/messages`), {
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
    <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
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
        <div className="mt-4">
          <div className="max-h-72 space-y-3 overflow-y-auto rounded-lg bg-slate-50 p-3 text-sm">
            {messages.length ? (
              messages.map((message) => (
                <div key={message.id}>
                  <p className="font-medium text-slate-900">
                    {message.senderName ?? message.senderType}
                  </p>
                  <p className="mt-1 whitespace-pre-wrap break-words text-slate-700">
                    {message.content}
                  </p>
                </div>
              ))
            ) : (
              <p className="text-slate-600">No messages yet.</p>
            )}
          </div>
          {canSend ? (
            <form className="mt-3 grid gap-2" onSubmit={(event) => void sendMessage(event)}>
              <label className="sr-only" htmlFor={`chat-${threadId}`}>
                Message
              </label>
              <textarea
                className="min-h-20 rounded-lg border border-slate-300 p-2 text-sm"
                id={`chat-${threadId}`}
                maxLength={2000}
                onChange={(event) => setContent(event.target.value)}
                placeholder="Write a message"
                value={content}
              />
              <button
                className="w-fit rounded-lg bg-slate-950 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
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
