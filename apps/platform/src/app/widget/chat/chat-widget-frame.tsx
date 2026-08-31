'use client';

import { createRealtime, RealtimeProvider } from '@upstash/realtime/client';
import { FormEvent, useEffect, useState } from 'react';
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
    };
    window.addEventListener('message', receive);
    return () => window.removeEventListener('message', receive);
  }, [hostOrigin]);

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
      <div className="widget-shell">
        {isOpen ? (
          <section aria-label="Chat conversation" className="conversation">
            <header>
              <strong>{agentName}</strong>
              <button aria-label="Close chat" onClick={() => setIsOpen(false)} type="button">
                ×
              </button>
            </header>
            <div aria-live="polite" className="messages">
              {messages.length ? (
                messages.map((message) => (
                  <article
                    className={message.senderType === 'VISITOR' ? 'visitor' : 'agent'}
                    key={message.id}
                  >
                    <strong>
                      {message.senderName ?? (message.senderType === 'VISITOR' ? 'You' : agentName)}
                    </strong>
                    <p>{message.content}</p>
                  </article>
                ))
              ) : (
                <p className="empty">How can we help?</p>
              )}
            </div>
            <form onSubmit={sendMessage}>
              <label className="sr-only" htmlFor="supernizo-chat-input">
                Message
              </label>
              <textarea
                id="supernizo-chat-input"
                maxLength={2000}
                onChange={(event) => setContent(event.target.value)}
                placeholder="Write a message"
                value={content}
              />
              <button disabled={!config || !content.trim()} type="submit">
                Send
              </button>
            </form>
          </section>
        ) : null}
        <button
          aria-label="Open chat"
          className="launcher"
          onClick={() => {
            setIsOpen(true);
            setUnread(0);
          }}
          type="button"
        >
          Chat{unread ? ` (${unread})` : ''}
        </button>
      </div>
      <style jsx>{`
        .widget-shell {
          bottom: 0;
          box-sizing: border-box;
          display: grid;
          gap: 10px;
          position: absolute;
          right: 0;
          width: 100%;
        }
        .launcher,
        .conversation {
          border: 0;
          box-shadow: 0 10px 30px rgba(15, 23, 42, 0.2);
        }
        .launcher {
          background: #0f172a;
          border-radius: 999px;
          color: #fff;
          justify-self: end;
          padding: 13px 20px;
          font:
            600 14px Arial,
            sans-serif;
        }
        .conversation {
          background: #fff;
          border-radius: 16px;
          color: #0f172a;
          display: grid;
          grid-template-rows: auto minmax(180px, 1fr) auto;
          height: 390px;
          overflow: hidden;
        }
        header {
          align-items: center;
          background: #0f172a;
          color: #fff;
          display: flex;
          font:
            600 15px Arial,
            sans-serif;
          justify-content: space-between;
          padding: 15px;
        }
        header button {
          background: transparent;
          border: 0;
          color: #fff;
          font-size: 22px;
          line-height: 1;
        }
        .messages {
          display: grid;
          gap: 10px;
          overflow-y: auto;
          padding: 14px;
        }
        article {
          border-radius: 10px;
          font:
            14px/1.4 Arial,
            sans-serif;
          max-width: 85%;
          padding: 9px 10px;
        }
        article strong {
          display: block;
          font-size: 12px;
          margin-bottom: 3px;
        }
        article p {
          margin: 0;
          overflow-wrap: anywhere;
          white-space: pre-wrap;
        }
        .agent {
          background: #e2e8f0;
          justify-self: start;
        }
        .visitor {
          background: #dbeafe;
          justify-self: end;
        }
        .empty {
          color: #64748b;
          font:
            14px Arial,
            sans-serif;
          margin: auto;
        }
        form {
          border-top: 1px solid #e2e8f0;
          display: grid;
          gap: 8px;
          padding: 10px;
        }
        textarea {
          border: 1px solid #cbd5e1;
          border-radius: 8px;
          font:
            14px Arial,
            sans-serif;
          min-height: 48px;
          padding: 8px;
          resize: vertical;
        }
        form button {
          background: #0f172a;
          border: 0;
          border-radius: 8px;
          color: #fff;
          font:
            600 14px Arial,
            sans-serif;
          justify-self: end;
          padding: 8px 12px;
        }
        form button:disabled {
          opacity: 0.45;
        }
        .sr-only {
          height: 1px;
          overflow: hidden;
          position: absolute;
          width: 1px;
        }
      `}</style>
    </>
  );
}

export function ChatWidgetFrame({ hostOrigin }: ChatWidgetFrameProps) {
  return <ChatWidgetContent hostOrigin={hostOrigin} />;
}
