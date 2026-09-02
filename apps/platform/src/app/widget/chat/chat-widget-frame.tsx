'use client';

import {
  ChatCircleDotsIcon,
  ChecksIcon,
  PaperPlaneRightIcon,
  ShieldCheckIcon,
  XIcon,
} from '@phosphor-icons/react';
import { createRealtime, RealtimeProvider } from '@upstash/realtime/client';
import Image from 'next/image';
import { type FormEvent, type KeyboardEvent, useEffect, useRef, useState } from 'react';
import { z } from 'zod';

import { ChatMessageSchema, type ChatMessage } from '@supernizo/shared';

import { mergeChatMessage } from '@/app/components/chat-state';
import callBackground from '@/assets/call bg.webp';

const WidgetConfigSchema = z.object({
  messages: z.array(ChatMessageSchema),
  threadId: z.string().min(1),
  token: z.string().min(1),
});
const { useRealtime } = createRealtime<{
  chat: { message: z.ZodObject<{ message: typeof ChatMessageSchema }> };
}>();

type ChatWidgetFrameProps = Readonly<{ hostOrigin: string }>;
type WidgetConfig = z.infer<typeof WidgetConfigSchema>;

const messageTimeFormatter = new Intl.DateTimeFormat(undefined, {
  hour: 'numeric',
  minute: '2-digit',
});
const messageDayFormatter = new Intl.DateTimeFormat(undefined, {
  day: 'numeric',
  month: 'short',
  weekday: 'short',
});

function initials(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part.charAt(0).toUpperCase())
      .join('') || 'S'
  );
}

function messageTime(sentAt: string): string {
  const date = new Date(sentAt);
  return Number.isNaN(date.getTime()) ? '' : messageTimeFormatter.format(date);
}

function conversationDay(sentAt: string | undefined): string {
  if (!sentAt) return 'Today';
  const date = new Date(sentAt);
  if (Number.isNaN(date.getTime())) return 'Today';
  const now = new Date();
  return date.toDateString() === now.toDateString() ? 'Today' : messageDayFormatter.format(date);
}

function ChatSubscription({
  config,
  isOpen,
  onMessage,
}: Readonly<{
  config: WidgetConfig | null;
  isOpen: boolean;
  onMessage: (message: ChatMessage, incrementUnread: boolean) => void;
}>) {
  useRealtime({
    channels: config ? [`chat:${config.threadId}`] : [],
    enabled: Boolean(config),
    events: ['chat.message'],
    onData: ({ data }) => onMessage(data.message, !isOpen),
  });
  return null;
}

function ChatWidgetContent({ hostOrigin }: ChatWidgetFrameProps) {
  const [config, setConfig] = useState<WidgetConfig | null>(null);
  const [content, setContent] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [unread, setUnread] = useState(0);
  const messageEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const agentName =
    [...messages].reverse().find((message) => message.senderType === 'AGENT')?.senderName ??
    'Support team';

  useEffect(() => {
    const receive = (event: MessageEvent<unknown>) => {
      if (event.origin !== hostOrigin || !event.data || typeof event.data !== 'object') return;
      const data = event.data as { config?: unknown; message?: unknown; type?: unknown };

      if (data.type === 'supernizo-chat-config') {
        const parsed = WidgetConfigSchema.safeParse(data.config);
        if (!parsed.success) return;
        setConfig(parsed.data);
        setMessages(parsed.data.messages);
      }
      if (data.type === 'supernizo-chat-message') {
        const parsed = ChatMessageSchema.safeParse(data.message);
        if (parsed.success) setMessages((current) => mergeChatMessage(current, parsed.data));
      }
      if (data.type === 'supernizo-chat-open') {
        setIsOpen(true);
        setUnread(0);
      }
    };
    window.addEventListener('message', receive);
    window.parent.postMessage({ type: 'supernizo-chat-ready' }, hostOrigin);
    return () => window.removeEventListener('message', receive);
  }, [hostOrigin]);

  useEffect(() => {
    if (!isOpen) return;
    messageEndRef.current?.scrollIntoView({ block: 'end' });
  }, [isOpen, messages]);

  useEffect(() => {
    if (isOpen && config) textareaRef.current?.focus();
  }, [config, isOpen]);

  function appendMessage(message: ChatMessage, incrementUnread: boolean): void {
    setMessages((current) => mergeChatMessage(current, message));
    if (incrementUnread && message.senderType === 'AGENT') setUnread((current) => current + 1);
  }

  function sendMessage(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const trimmedContent = content.trim();
    if (!config || !trimmedContent) return;

    window.parent.postMessage(
      {
        message: { content: trimmedContent, threadId: config.threadId },
        type: 'supernizo-chat-send',
      },
      hostOrigin,
    );
    setContent('');
    if (textareaRef.current) textareaRef.current.style.height = '';
  }

  function handleComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>): void {
    if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return;
    event.preventDefault();
    event.currentTarget.form?.requestSubmit();
  }

  function closeChat(): void {
    setIsOpen(false);
    window.parent.postMessage({ type: 'supernizo-chat-close' }, hostOrigin);
  }

  return (
    <>
      <RealtimeProvider
        key={config?.token ?? 'unauthenticated'}
        api={{
          url: config ? `/api/realtime/${encodeURIComponent(config.token)}` : '/api/realtime',
          withCredentials: false,
        }}
      >
        <ChatSubscription config={config} isOpen={isOpen} onMessage={appendMessage} />
      </RealtimeProvider>

      {isOpen ? (
        <section
          aria-label="Chat conversation"
          className="relative flex h-[calc(100vh-2px)] min-h-[500px] w-full flex-col overflow-hidden rounded-2xl border border-slate-200 font-sans text-slate-900 shadow-[0_14px_34px_rgba(15,23,42,0.1)]"
        >
          <Image
            alt=""
            aria-hidden="true"
            className="pointer-events-none object-cover"
            fill
            priority
            sizes="330px"
            src={callBackground}
          />

          <div className="relative z-10 flex h-full min-h-0 flex-col">
            <header className="flex items-center justify-between gap-3 px-5 py-4">
              <div className="flex min-w-0 items-center gap-3">
                <div className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white p-0.5 shadow-sm ring-2 ring-slate-100">
                  <span className="flex h-full w-full items-center justify-center rounded-full bg-[#e8eef5] text-sm font-bold tracking-[-0.04em] text-[#18324d]">
                    {initials(agentName)}
                  </span>
                  <span
                    aria-label="Online"
                    className="absolute right-0 bottom-0 h-3 w-3 rounded-full border-2 border-white bg-emerald-500"
                    role="status"
                  />
                </div>
                <div className="min-w-0">
                  <p className="m-0 truncate text-[15px] font-semibold text-slate-800">
                    {agentName}
                  </p>
                  <p className="m-0 mt-0.5 truncate text-[11px] font-medium text-slate-500">
                    Online · Usually replies quickly
                  </p>
                </div>
              </div>
              <button
                aria-label="Close chat"
                className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full border border-slate-200 bg-white/80 text-slate-500 transition hover:bg-white hover:text-slate-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#18324d]"
                onClick={closeChat}
                type="button"
              >
                <XIcon aria-hidden="true" size={16} weight="bold" />
              </button>
            </header>

            <div className="flex items-center justify-between border-y border-slate-100 bg-white/[0.55] px-5 py-2.5 backdrop-blur-sm">
              <div className="flex items-center gap-2 text-[11px] font-semibold text-slate-600">
                <ChatCircleDotsIcon aria-hidden="true" size={15} weight="fill" />
                Live event support
              </div>
              <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-slate-500">
                <ShieldCheckIcon aria-hidden="true" size={13} weight="fill" />
                Verified
              </span>
            </div>

            <div
              aria-live="polite"
              aria-relevant="additions"
              className="message-scroll min-h-0 flex-1 overflow-y-auto bg-white/[0.38] px-4 py-4"
            >
              {messages.length ? (
                <>
                  <div className="mb-4 flex items-center justify-center">
                    <span className="rounded-full border border-slate-200 bg-white/80 px-2.5 py-1 text-[10px] font-semibold text-slate-500 shadow-sm backdrop-blur-sm">
                      {conversationDay(messages[0]?.sentAt)}
                    </span>
                  </div>
                  <ol className="m-0 grid list-none gap-3 p-0">
                    {messages.map((message) => {
                      if (message.senderType === 'SYSTEM') {
                        return (
                          <li className="flex justify-center" key={message.id}>
                            <p className="m-0 max-w-[90%] rounded-full bg-slate-100/90 px-3 py-1.5 text-center text-[10px] leading-4 text-slate-500">
                              {message.content}
                            </p>
                          </li>
                        );
                      }

                      const isVisitor = message.senderType === 'VISITOR';
                      return (
                        <li
                          className={`flex ${isVisitor ? 'justify-end' : 'justify-start'}`}
                          key={message.id}
                        >
                          <article className="max-w-[84%]">
                            {!isVisitor ? (
                              <p className="m-0 mb-1 pl-1 text-[10px] font-semibold text-slate-500">
                                {message.senderName ?? agentName}
                              </p>
                            ) : null}
                            <div
                              className={`px-3.5 py-2.5 text-[13px] leading-[1.45] shadow-sm ${
                                isVisitor
                                  ? 'rounded-2xl rounded-br-md bg-[#18324d] text-white'
                                  : 'rounded-2xl rounded-bl-md border border-slate-200 bg-white/95 text-slate-700'
                              }`}
                            >
                              <p className="m-0 whitespace-pre-wrap break-words">
                                {message.content}
                              </p>
                            </div>
                            <div
                              className={`mt-1 flex items-center gap-1 px-1 text-[9px] font-medium text-slate-400 ${
                                isVisitor ? 'justify-end' : 'justify-start'
                              }`}
                            >
                              <span>{messageTime(message.sentAt)}</span>
                              {isVisitor ? (
                                <ChecksIcon aria-label="Sent" size={12} weight="bold" />
                              ) : null}
                            </div>
                          </article>
                        </li>
                      );
                    })}
                  </ol>
                </>
              ) : (
                <div className="flex h-full min-h-52 flex-col items-center justify-center px-5 text-center">
                  <span className="flex h-12 w-12 items-center justify-center rounded-full border border-slate-200 bg-white/[0.85] text-[#18324d] shadow-sm">
                    <ChatCircleDotsIcon aria-hidden="true" size={24} weight="fill" />
                  </span>
                  <p className="m-0 mt-3 text-sm font-semibold text-slate-800">
                    Start a conversation
                  </p>
                  <p className="m-0 mt-1 max-w-52 text-xs leading-5 text-slate-500">
                    Ask us anything about the event. Our team is here to help.
                  </p>
                </div>
              )}
              <div ref={messageEndRef} />
            </div>

            <form
              className="border-t border-slate-200/80 bg-white/[0.88] px-3 pt-3 pb-2.5 backdrop-blur-md"
              onSubmit={sendMessage}
            >
              <label className="sr-only" htmlFor="supernizo-chat-input">
                Message
              </label>
              <div className="flex items-end gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 shadow-sm transition focus-within:border-[#6b879e] focus-within:ring-2 focus-within:ring-[#18324d]/10">
                <textarea
                  className="max-h-[88px] min-h-10 flex-1 resize-none border-0 bg-transparent py-2 text-[13px] leading-5 text-slate-800 outline-none placeholder:text-slate-400 disabled:cursor-wait"
                  disabled={!config}
                  id="supernizo-chat-input"
                  maxLength={2000}
                  onChange={(event) => {
                    setContent(event.target.value);
                    event.target.style.height = '0px';
                    event.target.style.height = `${Math.min(event.target.scrollHeight, 88)}px`;
                  }}
                  onKeyDown={handleComposerKeyDown}
                  placeholder={config ? 'Write a message…' : 'Connecting…'}
                  ref={textareaRef}
                  rows={1}
                  value={content}
                />
                <button
                  aria-label="Send message"
                  className="flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-full bg-[#18324d] text-white shadow-sm transition hover:bg-[#0f2740] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#18324d] disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400 disabled:shadow-none"
                  disabled={!config || !content.trim()}
                  type="submit"
                >
                  <PaperPlaneRightIcon aria-hidden="true" size={18} weight="fill" />
                </button>
              </div>
              <div className="mt-2 flex items-center justify-between gap-2 px-1 text-[9px] font-medium text-slate-400">
                <span className="inline-flex items-center gap-1">
                  <ShieldCheckIcon aria-hidden="true" size={11} weight="fill" />
                  Private and secure
                </span>
                <span>{content.length > 1600 ? `${content.length}/2000` : 'Enter to send'}</span>
              </div>
            </form>
          </div>
        </section>
      ) : (
        <button
          aria-label="Open chat"
          className="sr-only"
          onClick={() => {
            setIsOpen(true);
            setUnread(0);
          }}
          type="button"
        >
          Open chat{unread ? ` (${unread})` : ''}
        </button>
      )}

      <style jsx>{`
        :global(html),
        :global(body) {
          background: transparent;
          height: 100%;
          margin: 0;
          overflow: hidden;
        }
        .message-scroll {
          scrollbar-color: rgba(100, 116, 139, 0.35) transparent;
          scrollbar-width: thin;
        }
        .message-scroll::-webkit-scrollbar {
          width: 5px;
        }
        .message-scroll::-webkit-scrollbar-thumb {
          background: rgba(100, 116, 139, 0.3);
          border-radius: 999px;
        }
      `}</style>
    </>
  );
}

export function ChatWidgetFrame({ hostOrigin }: ChatWidgetFrameProps) {
  return <ChatWidgetContent hostOrigin={hostOrigin} />;
}
