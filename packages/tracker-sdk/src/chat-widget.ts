import type { ChatMessage, TrackingContext } from '@supernizo/shared';

type ChatThreadResponse = Readonly<{
  history: Readonly<{ messages: ChatMessage[] }>;
  realtime: Readonly<{ channel: string; token: string }>;
  thread: Readonly<{ id: string }>;
}>;

type ChatWidgetConfig = Readonly<{
  messages: ChatMessage[];
  threadId: string;
  token: string;
}>;

export function shouldOpenChatForNewAgentMessage(
  hasSyncedThread: boolean,
  latestAgentMessageId: string | undefined,
  nextAgentMessageId: string | undefined,
): boolean {
  return Boolean(
    hasSyncedThread && nextAgentMessageId && nextAgentMessageId !== latestAgentMessageId,
  );
}

function isChatThreadResponse(value: unknown): value is ChatThreadResponse {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<ChatThreadResponse>;
  return Boolean(
    candidate.thread &&
    typeof candidate.thread.id === 'string' &&
    candidate.realtime &&
    typeof candidate.realtime.token === 'string' &&
    candidate.history &&
    Array.isArray(candidate.history.messages),
  );
}

function isOutboundMessage(
  value: unknown,
): value is Readonly<{ content: string; threadId: string }> {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as { content?: unknown; threadId?: unknown };
  return typeof candidate.content === 'string' && typeof candidate.threadId === 'string';
}

function isMessage(value: unknown): value is ChatMessage {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<ChatMessage>;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.threadId === 'string' &&
    typeof candidate.content === 'string' &&
    typeof candidate.sentAt === 'string' &&
    (candidate.senderType === 'AGENT' ||
      candidate.senderType === 'VISITOR' ||
      candidate.senderType === 'SYSTEM')
  );
}

export class ChatWidgetController {
  private currentConfig: ChatWidgetConfig | undefined;
  private frame: HTMLIFrameElement | undefined;
  private launcher: HTMLButtonElement | undefined;
  private launcherStyle: HTMLStyleElement | undefined;
  private hasSyncedThread = false;
  private latestAgentMessageId: string | undefined;
  private openRequested = false;
  private syncTimer: number | undefined;

  public constructor(
    private readonly context: TrackingContext,
    private readonly bootstrapEndpoint: string,
  ) {}

  public start(): void {
    try {
      this.mountLauncher();
      void this.syncThread();
      this.syncTimer = window.setInterval(() => void this.syncThread(), 3_000);
    } catch {
      // The widget is optional and must never interrupt the tracked website.
    }
  }

  public stop(): void {
    if (this.syncTimer !== undefined) {
      window.clearInterval(this.syncTimer);
      this.syncTimer = undefined;
    }
    window.removeEventListener('message', this.receiveMessage);
    this.unmountFrame();
    this.launcher?.remove();
    this.launcher = undefined;
    this.launcherStyle?.remove();
    this.launcherStyle = undefined;
    this.hasSyncedThread = false;
    this.latestAgentMessageId = undefined;
    this.openRequested = false;
    this.currentConfig = undefined;
  }

  private mount(): void {
    if (this.frame) return;
    const widgetUrl = new URL('/widget/chat', this.bootstrapEndpoint);
    widgetUrl.searchParams.set('host_origin', window.location.origin);

    const frame = document.createElement('iframe');
    frame.setAttribute('aria-label', 'Website chat');
    frame.setAttribute('title', 'Website chat');
    frame.src = widgetUrl.toString();
    frame.style.cssText = [
      'background:transparent',
      'border:0',
      'bottom:16px',
      'height:590px',
      'max-height:calc(100vh - 32px)',
      'max-width:calc(100vw - 32px)',
      'position:fixed',
      'right:16px',
      'width:360px',
      'z-index:2147483000',
    ].join(';');
    frame.addEventListener('load', () => this.postConfig());
    window.addEventListener('message', this.receiveMessage);
    (document.body ?? document.documentElement).append(frame);
    this.frame = frame;
  }

  private unmountFrame(): void {
    this.frame?.remove();
    this.frame = undefined;
  }

  private mountLauncher(): void {
    if (this.launcher) return;
    const launcher = document.createElement('button');
    launcher.setAttribute('aria-label', 'Open chat with the event team');
    launcher.setAttribute('type', 'button');
    launcher.innerHTML =
      '<span aria-hidden="true" class="supernizo-chat-launcher__halo"></span><span aria-hidden="true" class="supernizo-chat-launcher__avatar">S</span><span aria-hidden="true" class="supernizo-chat-launcher__badge"></span>';
    launcher.style.cssText = [
      'align-items:center',
      'appearance:none',
      'background:linear-gradient(145deg,#0d536e,#082337)',
      'border:1px solid rgba(159,231,255,.62)',
      'border-radius:999px',
      'bottom:20px',
      'box-shadow:0 12px 30px rgba(1,14,25,.35),inset 0 1px 1px rgba(255,255,255,.22)',
      'color:#effbff',
      'cursor:pointer',
      'display:inline-flex',
      'height:62px',
      'isolation:isolate',
      'justify-content:center',
      'padding:0',
      'position:fixed',
      'right:20px',
      'transition:transform .2s ease,box-shadow .2s ease',
      'width:62px',
      'z-index:2147482999',
    ].join(';');
    launcher.addEventListener('click', () => this.openChat());
    launcher.addEventListener('mouseenter', () => {
      launcher.style.transform = 'translateY(-3px) scale(1.03)';
      launcher.style.boxShadow =
        '0 16px 34px rgba(1,14,25,.42),inset 0 1px 1px rgba(255,255,255,.26)';
    });
    launcher.addEventListener('mouseleave', () => {
      launcher.style.transform = '';
      launcher.style.boxShadow = '';
    });
    (document.body ?? document.documentElement).append(launcher);
    this.launcher = launcher;

    const style = document.createElement('style');
    style.dataset.supernizoChatLauncher = 'true';
    style.textContent = `
      .supernizo-chat-launcher__halo { position:absolute; inset:7px; border:1px solid rgba(180,239,255,.28); border-radius:inherit; }
      .supernizo-chat-launcher__avatar { align-items:center; background:linear-gradient(145deg,#3bd3d0,#1182a0); border-radius:999px; box-shadow:inset 0 1px 2px rgba(255,255,255,.44); display:flex; font:700 20px/1 Arial,sans-serif; height:42px; justify-content:center; position:relative; width:42px; }
      .supernizo-chat-launcher__badge { background:#35e0b1; border:2px solid #082337; border-radius:999px; bottom:7px; box-shadow:0 0 0 3px rgba(53,224,177,.14); display:none; height:10px; position:absolute; right:7px; width:10px; }
      button[data-supernizo-unread='true'] .supernizo-chat-launcher__badge { display:block; }
      @media (max-width: 480px) { .supernizo-chat-launcher__avatar { font-size:18px; } }
    `;
    (document.head ?? document.documentElement).append(style);
    this.launcherStyle = style;
  }

  private openChat(): void {
    this.openRequested = true;
    this.launcher?.removeAttribute('data-supernizo-unread');
    this.mount();
    this.postConfig();
    this.postOpenRequest();
  }

  private readonly receiveMessage = (event: MessageEvent<unknown>): void => {
    if (
      event.origin !== new URL(this.bootstrapEndpoint).origin ||
      event.source !== this.frame?.contentWindow
    ) {
      return;
    }
    if (!event.data || typeof event.data !== 'object') return;
    const data = event.data as { message?: unknown; type?: unknown };

    if (data.type === 'supernizo-chat-ready') {
      this.postConfig();
      this.postOpenRequest();
      return;
    }

    if (data.type === 'supernizo-chat-close') {
      this.openRequested = false;
      this.unmountFrame();
      return;
    }

    if (data.type === 'supernizo-chat-send' && isOutboundMessage(data.message)) {
      void this.sendMessage(data.message);
    }
  };

  private async syncThread(): Promise<void> {
    try {
      const endpoint = new URL('/api/chat/visitor/thread', this.bootstrapEndpoint);
      endpoint.searchParams.set('sitePublicKey', this.context.sitePublicKey);
      endpoint.searchParams.set('visitorId', this.context.visitorId);
      endpoint.searchParams.set('sessionId', this.context.sessionId);
      endpoint.searchParams.set('limit', '50');

      const response = await fetch(endpoint, { credentials: 'omit', mode: 'cors' });
      if (!response.ok) return;
      const body: unknown = await response.json();
      if (
        !body ||
        typeof body !== 'object' ||
        !('data' in body) ||
        !isChatThreadResponse(body.data)
      )
        return;

      const agentMessage = [...body.data.history.messages]
        .reverse()
        .find((message) => message.senderType === 'AGENT');
      const isNewAgentMessage = shouldOpenChatForNewAgentMessage(
        this.hasSyncedThread,
        this.latestAgentMessageId,
        agentMessage?.id,
      );
      this.latestAgentMessageId = agentMessage?.id;
      this.hasSyncedThread = true;
      this.currentConfig = {
        messages: body.data.history.messages,
        threadId: body.data.thread.id,
        token: body.data.realtime.token,
      };
      this.postConfig();

      if (isNewAgentMessage) {
        this.launcher?.setAttribute('data-supernizo-unread', 'true');
        this.openChat();
      }
    } catch {
      // A temporary chat sync failure must not interrupt the tracked website.
    }
  }

  private postConfig(): void {
    if (!this.currentConfig || !this.frame?.contentWindow) return;
    this.frame.contentWindow.postMessage(
      { config: this.currentConfig, type: 'supernizo-chat-config' },
      new URL(this.bootstrapEndpoint).origin,
    );
  }

  private postOpenRequest(): void {
    if (!this.openRequested || !this.frame?.contentWindow) return;
    this.frame.contentWindow.postMessage(
      { type: 'supernizo-chat-open' },
      new URL(this.bootstrapEndpoint).origin,
    );
  }

  private async sendMessage(
    message: Readonly<{ content: string; threadId: string }>,
  ): Promise<void> {
    if (!this.currentConfig || message.threadId !== this.currentConfig.threadId) return;
    const content = message.content.trim().slice(0, 2_000);
    if (!content) return;

    const endpoint = new URL(
      `/api/chat/threads/${message.threadId}/messages`,
      this.bootstrapEndpoint,
    );
    const response = await fetch(endpoint, {
      body: JSON.stringify({ content, context: this.context }),
      credentials: 'omit',
      headers: { 'content-type': 'text/plain;charset=UTF-8' },
      keepalive: true,
      method: 'POST',
      mode: 'cors',
    });
    if (!response.ok) return;

    const body: unknown = await response.json();
    if (!body || typeof body !== 'object' || !('data' in body) || !isMessage(body.data)) return;
    this.frame?.contentWindow?.postMessage(
      { message: body.data, type: 'supernizo-chat-message' },
      new URL(this.bootstrapEndpoint).origin,
    );
  }
}
