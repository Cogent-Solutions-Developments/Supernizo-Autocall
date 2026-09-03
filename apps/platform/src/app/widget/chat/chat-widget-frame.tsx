'use client';

import {
  ChatCircleDotsIcon,
  ChecksIcon,
  PaperPlaneRightIcon,
  ShieldCheckIcon,
  XIcon,
} from '@phosphor-icons/react';
import { createRealtime, RealtimeProvider } from '@upstash/realtime/client';
import { type FormEvent, type KeyboardEvent, useEffect, useRef, useState } from 'react';
import { z } from 'zod';

import { ChatMessageSchema, type ChatMessage } from '@supernizo/shared';

import { mergeChatMessage } from '@/app/components/chat-state';

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
          className="flex h-[calc(100vh-2px)] min-h-[500px] w-full flex-col overflow-hidden rounded-[18px] border border-[#e4e4e7] bg-white text-[#18181b] shadow-[0_20px_50px_rgba(0,0,0,0.14)]"
        >
          <div className="flex h-full min-h-0 flex-col">
            <header className="flex items-center justify-between gap-3 border-b border-[#e4e4e7] bg-white px-4 py-3.5">
              <div className="flex min-w-0 items-center gap-3">
                <div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] border border-[#e4e4e7] bg-[#f4f4f5]">
                  <span className="text-sm font-semibold tracking-[-0.02em] text-[#18181b]">
                    {initials(agentName)}
                  </span>
                  <span
                    aria-label="Online now"
                    className="absolute -right-1 -bottom-1 h-3 w-3 rounded-full border-[3px] border-white bg-[#22a06b]"
                    role="status"
                  />
                </div>
                <div className="min-w-0">
                  <p className="m-0 truncate text-sm font-semibold tracking-[-0.01em] text-[#18181b]">
                    {agentName}
                  </p>
                  <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-[#71717a]">
                    <span>Online now</span>
                    <span aria-hidden="true" className="text-[#d4d4d8]">
                      ·
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <ShieldCheckIcon aria-hidden="true" size={11} weight="fill" />
                      Verified
                    </span>
                  </div>
                </div>
              </div>
              <button
                aria-label="Close chat"
                className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-[9px] border border-transparent text-[#71717a] transition-colors duration-150 hover:border-[#e4e4e7] hover:bg-[#f4f4f5] hover:text-[#18181b] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#18181b]"
                onClick={closeChat}
                type="button"
              >
                <XIcon aria-hidden="true" size={17} />
              </button>
            </header>

            <div
              aria-live="polite"
              aria-relevant="additions"
              className="message-scroll min-h-0 flex-1 overflow-y-auto px-4 py-4"
            >
              {messages.length ? (
                <>
                  <div className="mb-4 flex items-center justify-center">
                    <span className="rounded-md bg-[#f4f4f5] px-2 py-1 text-[10px] font-medium text-[#71717a]">
                      {conversationDay(messages[0]?.sentAt)}
                    </span>
                  </div>
                  <ol className="m-0 grid list-none gap-3.5 p-0">
                    {messages.map((message) => {
                      if (message.senderType === 'SYSTEM') {
                        return (
                          <li className="flex justify-center" key={message.id}>
                            <p className="m-0 max-w-[90%] px-3 py-1.5 text-center text-[10px] leading-4 text-[#71717a]">
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
                              <p className="m-0 mb-1.5 pl-1 text-[10px] font-medium text-[#71717a]">
                                {message.senderName ?? agentName}
                              </p>
                            ) : null}
                            <div
                              className={`border px-3.5 py-2.5 text-[13px] leading-[1.5] ${
                                isVisitor
                                  ? 'rounded-[13px] rounded-br-[4px] border-[#18181b] bg-[#18181b] text-white'
                                  : 'rounded-[13px] rounded-bl-[4px] border-[#e4e4e7] bg-[#f4f4f5] text-[#27272a]'
                              }`}
                            >
                              <p className="m-0 whitespace-pre-wrap break-words">
                                {message.content}
                              </p>
                            </div>
                            <div
                              className={`mt-1.5 flex items-center gap-1 px-1 text-[9px] font-medium text-[#a1a1aa] ${
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
                <div className="flex h-full min-h-52 flex-col justify-center px-2 pb-5 text-left">
                  <span className="flex h-9 w-9 items-center justify-start text-[#18181b]">
                    <ChatCircleDotsIcon aria-hidden="true" size={22} weight="fill" />
                  </span>
                  <p className="m-0 mt-4 text-[12px] font-medium text-[#71717a]">Event support</p>
                  <h1 className="m-0 mt-1 text-[25px] leading-8 font-semibold tracking-[-0.035em] text-[#18181b]">
                    How can we help?
                  </h1>
                  <p className="m-0 mt-2 max-w-[245px] text-[13px] leading-5 text-[#71717a]">
                    Send us a message and someone from the team will reply here.
                  </p>
                  <div className="mt-5 flex items-center gap-2 border-t border-[#e4e4e7] pt-4 text-[11px] text-[#71717a]">
                    <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-[#22a06b]" />
                    Usually replies in a few minutes
                  </div>
                </div>
              )}
              <div ref={messageEndRef} />
            </div>

            <form
              className="border-t border-[#e4e4e7] bg-white px-3 pt-3 pb-2.5"
              onSubmit={sendMessage}
            >
              <label className="sr-only" htmlFor="supernizo-chat-input">
                Message
              </label>
              <div className="flex items-end gap-2 rounded-[12px] border border-[#e4e4e7] bg-[#fafafa] px-3 py-2 transition-colors duration-150 focus-within:border-[#a1a1aa] focus-within:ring-2 focus-within:ring-black/5">
                <textarea
                  className="max-h-[88px] min-h-10 flex-1 resize-none border-0 bg-transparent py-2 text-[13px] leading-5 text-[#18181b] outline-none placeholder:text-[#a1a1aa] disabled:cursor-wait"
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
                  className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-[9px] bg-[#18181b] text-white transition-colors duration-150 hover:bg-black focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#18181b] disabled:cursor-not-allowed disabled:bg-[#e4e4e7] disabled:text-[#a1a1aa]"
                  disabled={!config || !content.trim()}
                  type="submit"
                >
                  <PaperPlaneRightIcon aria-hidden="true" size={17} weight="fill" />
                </button>
              </div>
              <div className="mt-2 flex items-center justify-between gap-2 px-1 text-[9px] font-medium text-[#a1a1aa]">
                <span className="inline-flex items-center gap-1">
                  <ShieldCheckIcon aria-hidden="true" size={11} weight="fill" />
                  Private conversation
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
          font-family:
            var(--font-google-sans),
            'Google Sans',
            ui-sans-serif,
            system-ui,
            -apple-system,
            BlinkMacSystemFont,
            'Segoe UI',
            sans-serif;
          color-scheme: light;
        }
        .message-scroll {
          scrollbar-color: #d4d4d8 transparent;
          scrollbar-width: thin;
        }
        .message-scroll::-webkit-scrollbar {
          width: 5px;
        }
        .message-scroll::-webkit-scrollbar-thumb {
          background: #d4d4d8;
          border-radius: 999px;
        }
      `}</style>
    </>
  );
}

export function ChatWidgetFrame({ hostOrigin }: ChatWidgetFrameProps) {
  return <ChatWidgetContent hostOrigin={hostOrigin} />;
}
