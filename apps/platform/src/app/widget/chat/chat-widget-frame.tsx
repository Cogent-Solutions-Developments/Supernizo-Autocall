'use client';

import { createRealtime, RealtimeProvider } from '@upstash/realtime/client';
import { FormEvent, useEffect, useState } from 'react';
import { z } from 'zod';

import { ChatMessageSchema, type ChatMessage } from '@supernizo/shared';

import { mergeChatMessage } from '@/app/components/chat-state';
import { withAppBasePath } from '@/lib/app-path';

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
      if (data.type === 'supernizo-chat-open') {
        setIsOpen(true);
        setUnread(0);
      }
    };
    window.addEventListener('message', receive);
    window.parent.postMessage({ type: 'supernizo-chat-ready' }, hostOrigin);
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

  function closeChat(): void {
    setIsOpen(false);
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
      <div className="widget-shell">
        {isOpen ? (
          <section aria-label="Chat conversation" className="conversation">
            <header>
              <strong>{agentName}</strong>
              <button aria-label="Close chat" onClick={closeChat} type="button">
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
      <style jsx>{`
        .widget-shell {
          display: block;
        }
        .launcher {
          display: none;
        }
        .conversation {
          background: linear-gradient(145deg, rgba(11, 37, 52, 0.98), rgba(3, 20, 33, 0.99));
          border: 1px solid rgba(170, 229, 241, 0.32);
          border-radius: 22px;
          box-shadow:
            0 24px 60px rgba(1, 14, 25, 0.4),
            inset 0 1px 0 rgba(255, 255, 255, 0.09);
          color: #eaf8fc;
          grid-template-rows: auto minmax(190px, 1fr) auto;
          height: 536px;
        }
        header {
          background: transparent;
          padding: 18px 18px 16px;
        }
        header strong {
          align-items: center;
          display: flex;
          font:
            700 15px/1.2 Arial,
            sans-serif;
          gap: 10px;
        }
        header strong::before {
          align-items: center;
          background: linear-gradient(145deg, #43d5cf, #117b9c);
          border: 1px solid rgba(206, 255, 253, 0.46);
          border-radius: 50%;
          box-shadow: inset 0 1px 3px rgba(255, 255, 255, 0.46);
          color: #fff;
          content: 'S';
          display: flex;
          font:
            700 16px/1 Arial,
            sans-serif;
          height: 37px;
          justify-content: center;
          width: 37px;
        }
        header strong::after {
          color: #a8c2cc;
          content: 'Usually replies quickly';
          font:
            12px/1.4 Arial,
            sans-serif;
          font-weight: 400;
          margin-left: -3px;
        }
        header button {
          align-items: center;
          background: rgba(168, 217, 229, 0.09);
          border: 1px solid rgba(183, 229, 239, 0.14);
          border-radius: 50%;
          color: #bed9e2;
          cursor: pointer;
          display: flex;
          height: 31px;
          justify-content: center;
          padding: 0;
          width: 31px;
        }
        .messages {
          background: linear-gradient(180deg, rgba(8, 30, 44, 0.18), rgba(6, 29, 42, 0.45));
          border-bottom: 1px solid rgba(165, 220, 232, 0.1);
          border-top: 1px solid rgba(165, 220, 232, 0.1);
          padding: 16px 18px;
        }
        article {
          border: 1px solid rgba(172, 228, 238, 0.12);
          border-radius: 14px 14px 14px 4px;
          color: #eaf8fc;
          font-size: 13px;
          padding: 10px 12px;
        }
        article strong {
          color: #9cc4cf;
          font-size: 10px;
          font-weight: 500;
          letter-spacing: 0.02em;
        }
        .agent {
          background: rgba(112, 176, 192, 0.11);
        }
        .visitor {
          background: linear-gradient(135deg, #147e9c, #176182);
          border-color: rgba(135, 233, 239, 0.25);
          border-radius: 14px 14px 4px 14px;
        }
        .visitor strong {
          color: #d2f7f5;
        }
        .empty {
          align-self: center;
          color: #a7c2cb;
          font-size: 13px;
          text-align: center;
        }
        form {
          align-items: end;
          border-top: 0;
          gap: 9px;
          grid-template-columns: 1fr auto;
          padding: 13px 14px 15px;
        }
        textarea {
          background: rgba(0, 12, 23, 0.58);
          border: 1px solid rgba(166, 219, 230, 0.18);
          border-radius: 13px;
          box-sizing: border-box;
          color: #ecf9fc;
          min-height: 44px;
          padding: 12px 13px;
          resize: none;
          width: 100%;
        }
        textarea:focus {
          border-color: rgba(79, 213, 207, 0.72);
          box-shadow: 0 0 0 3px rgba(79, 213, 207, 0.1);
          outline: none;
        }
        textarea::placeholder {
          color: #7898a4;
        }
        form button {
          background: linear-gradient(145deg, #45d4ca, #1589a5);
          border-radius: 12px;
          height: 44px;
          padding: 0 15px;
        }
      `}</style>
    </>
  );
}

export function ChatWidgetFrame({ hostOrigin }: ChatWidgetFrameProps) {
  return <ChatWidgetContent hostOrigin={hostOrigin} />;
}
