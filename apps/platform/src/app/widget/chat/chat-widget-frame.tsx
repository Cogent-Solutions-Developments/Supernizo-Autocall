'use client';

import { ChecksIcon, PaperPlaneRightIcon, XIcon } from '@phosphor-icons/react';
import { createRealtime, RealtimeProvider } from '@upstash/realtime/client';
import { type FormEvent, type KeyboardEvent, useEffect, useRef, useState } from 'react';
import { z } from 'zod';

import { ChatMessageSchema, type ChatMessage } from '@supernizo/shared';

import { CallerIdentityVideo } from '@/app/components/caller-identity-video';
import { mergeChatMessage } from '@/app/components/chat-state';
import { FlowingRibbons } from '@/app/components/flowing-ribbons';
import { withAppBasePath } from '@/lib/app-path';

import { NizoVerifiedIcon } from '../call/call-action-icons';

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

function displayAgentName(name: string | null | undefined): string {
  const normalizedName = name?.trim().toLowerCase();
  if (!normalizedName || ['support team', 'local admin', 'nizo'].includes(normalizedName)) {
    return 'Soniya Sahanya';
  }
  return name?.trim() || 'Soniya Sahanya';
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
  const agentName = displayAgentName(
    [...messages].reverse().find((message) => message.senderType === 'AGENT')?.senderName,
  );

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
    window.parent.postMessage({ type: 'supernizo-chat-close' }, hostOrigin);
  }

  return (
    <>
      <RealtimeProvider
        key={config?.token ?? 'unauthenticated'}
        api={{
          url: config
            ? withAppBasePath(`/api/realtime/${encodeURIComponent(config.token)}`)
            : withAppBasePath('/api/realtime'),
          withCredentials: false,
        }}
      >
        <ChatSubscription config={config} isOpen={isOpen} onMessage={appendMessage} />
      </RealtimeProvider>

      {isOpen ? (
        <section
          aria-label="Chat conversation"
          className="chat-shell relative flex h-[calc(100vh-2px)] w-full flex-col overflow-hidden rounded-[22px] border border-black/10 bg-[#fbfbfa] text-[#18181b] shadow-[0_24px_68px_rgba(24,24,27,0.18),0_3px_12px_rgba(24,24,27,0.08)]"
        >
          <div className="pointer-events-none absolute inset-0 overflow-hidden">
            <div className="absolute inset-x-0 top-0 h-48 bg-[radial-gradient(circle_at_16%_4%,rgba(85,201,133,0.11),transparent_46%),radial-gradient(circle_at_92%_8%,rgba(24,24,27,0.055),transparent_38%)]" />
            <div className="absolute inset-0 opacity-[0.94]">
              <FlowingRibbons
                animationSpeed={0.34}
                backgroundColor="transparent"
                lineColor="rgba(63,63,70,0.18)"
                placement="bottom"
              />
            </div>
          </div>

          <div className="relative z-10 flex h-full min-h-0 flex-col">
            <header className="chat-header flex items-center justify-between gap-3 px-4 pt-4 pb-2.5">
              <div className="flex min-w-0 items-center gap-3">
                <div className="relative h-11 w-11 shrink-0">
                  <CallerIdentityVideo className="ring-2 ring-white" />
                  <span
                    aria-label="Online now"
                    className="absolute right-0 bottom-0 h-3.5 w-3.5 rounded-full border-[3px] border-white bg-[#55c985]"
                    role="status"
                  />
                </div>
                <div className="min-w-0">
                  <p className="m-0 truncate text-[15px] leading-5 font-semibold tracking-[-0.025em] text-[#18181b]">
                    {agentName}
                  </p>
                  <div className="mt-1 flex items-center gap-1.5 text-[10px] font-medium text-[#85858d]">
                    <span>Online now</span>
                    <span aria-hidden="true" className="text-[#c4c4c8]">
                      ·
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <NizoVerifiedIcon />
                      Nizo Verified
                    </span>
                  </div>
                </div>
              </div>
              <button
                aria-label="Close chat"
                className="chat-close flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full border border-black/[0.06] bg-white/70 text-[#71717a] shadow-[0_1px_2px_rgba(24,24,27,0.04)] backdrop-blur-md transition-[background-color,color,transform] duration-200 ease-out focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#18181b]"
                onClick={closeChat}
                type="button"
              >
                <XIcon aria-hidden="true" size={16} weight="bold" />
              </button>
            </header>

            <div
              aria-live="polite"
              aria-relevant="additions"
              className="message-scroll min-h-0 flex-1 overflow-y-auto px-4 py-3"
            >
              {messages.length ? (
                <>
                  <div className="mb-4 flex items-center justify-center">
                    <span className="rounded-full border border-black/[0.06] bg-white/70 px-2.5 py-1 text-[9px] font-medium text-[#85858d] shadow-[0_1px_2px_rgba(24,24,27,0.04)] backdrop-blur-md">
                      {conversationDay(messages[0]?.sentAt)}
                    </span>
                  </div>
                  <ol className="m-0 grid list-none gap-3 p-0">
                    {messages.map((message) => {
                      if (message.senderType === 'SYSTEM') {
                        return (
                          <li className="chat-message flex justify-center" key={message.id}>
                            <p className="m-0 max-w-[90%] px-3 py-1.5 text-center text-[10px] leading-4 text-[#71717a]">
                              {message.content}
                            </p>
                          </li>
                        );
                      }

                      const isVisitor = message.senderType === 'VISITOR';
                      return (
                        <li
                          className={`chat-message flex ${isVisitor ? 'justify-end' : 'justify-start'}`}
                          key={message.id}
                        >
                          <article className="max-w-[85%]">
                            {!isVisitor ? (
                              <p className="m-0 mb-1.5 pl-1 text-[9px] font-medium text-[#85858d]">
                                {displayAgentName(message.senderName)}
                              </p>
                            ) : null}
                            <div
                              className={`border px-3.5 py-2.5 text-[13px] leading-[1.5] shadow-[0_1px_2px_rgba(24,24,27,0.04)] ${
                                isVisitor
                                  ? 'rounded-[13px] rounded-br-[4px] border-[#18181b] bg-[#18181b] text-white'
                                  : 'rounded-[13px] rounded-bl-[4px] border-black/[0.07] bg-white/80 text-[#27272a] backdrop-blur-md'
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
                <div className="chat-empty flex h-full min-h-52 flex-col items-center justify-center px-2 pb-4 text-center">
                  <h1 className="m-0 text-[28px] leading-[1.08] font-semibold tracking-[-0.045em] text-[#18181b]">
                    How Can We Help?
                  </h1>
                  <p className="m-0 mt-3 max-w-[270px] text-[13px] leading-5 text-[#71717a]">
                    Send a message. Soniya and the event team are ready to help.
                  </p>
                </div>
              )}
              <div ref={messageEndRef} />
            </div>

            <form
              className="chat-composer relative z-10 bg-gradient-to-t from-[#fbfbfa] via-[#fbfbfa] to-transparent px-3.5 pt-3 pb-3"
              onSubmit={sendMessage}
            >
              <label className="sr-only" htmlFor="supernizo-chat-input">
                Message
              </label>
              <div className="composer-field flex items-end gap-2 rounded-[15px] border border-black/10 bg-white/90 py-2 pr-2 pl-3.5 shadow-[0_8px_28px_rgba(24,24,27,0.08),0_1px_3px_rgba(24,24,27,0.06)] backdrop-blur-xl transition-[border-color,box-shadow] duration-200 ease-out focus-within:border-black/25 focus-within:shadow-[0_10px_32px_rgba(24,24,27,0.11),0_0_0_3px_rgba(24,24,27,0.04)]">
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
                  className="send-button flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-[11px] bg-[#18181b] text-white shadow-[0_4px_12px_rgba(24,24,27,0.15)] transition-[background-color,transform,box-shadow] duration-200 ease-out focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#18181b] disabled:cursor-not-allowed disabled:bg-[#e7e7e8] disabled:text-[#a1a1aa] disabled:shadow-none"
                  disabled={!config || !content.trim()}
                  type="submit"
                >
                  <PaperPlaneRightIcon aria-hidden="true" size={17} weight="fill" />
                </button>
              </div>
              <div className="mt-2 flex items-center justify-between gap-2 px-1 text-[9px] font-medium text-[#a1a1aa]">
                <span className="inline-flex items-center gap-1">
                  <NizoVerifiedIcon />
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
        .chat-header {
          animation: chat-content-in 240ms cubic-bezier(0.23, 1, 0.32, 1) 70ms both;
        }
        .chat-empty {
          animation: chat-content-in 280ms cubic-bezier(0.23, 1, 0.32, 1) 110ms both;
        }
        .chat-composer {
          animation: chat-composer-in 260ms cubic-bezier(0.23, 1, 0.32, 1) 130ms both;
        }
        .chat-message {
          animation: chat-message-in 220ms cubic-bezier(0.23, 1, 0.32, 1) both;
          transform-origin: bottom;
        }
        .chat-close:active,
        .send-button:not(:disabled):active {
          transform: scale(0.94);
        }
        @media (hover: hover) and (pointer: fine) {
          .chat-close:hover {
            background: rgba(255, 255, 255, 0.98);
            color: #18181b;
            transform: scale(1.04);
          }
          .send-button:not(:disabled):hover {
            background: #000;
            box-shadow: 0 6px 16px rgba(24, 24, 27, 0.22);
            transform: translateY(-1px);
          }
        }
        @keyframes chat-content-in {
          from {
            opacity: 0;
            transform: translateY(7px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        @keyframes chat-composer-in {
          from {
            opacity: 0;
            transform: translateY(10px) scale(0.985);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
        @keyframes chat-message-in {
          from {
            opacity: 0;
            transform: translateY(5px) scale(0.98);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
        @media (prefers-reduced-motion: reduce) {
          .chat-header,
          .chat-empty,
          .chat-composer,
          .chat-message {
            animation: none;
          }
          .chat-close,
          .send-button,
          .composer-field {
            transition: none;
          }
        }
      `}</style>
    </>
  );
}

export function ChatWidgetFrame({ hostOrigin }: ChatWidgetFrameProps) {
  return <ChatWidgetContent hostOrigin={hostOrigin} />;
}
