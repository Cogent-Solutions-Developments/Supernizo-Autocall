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

export function chatWidgetFrameStyles(): readonly string[] {
  return [
    'background:transparent',
    'border:0',
    'bottom:16px',
    'height:500px',
    'max-width:calc(100vw - 32px)',
    'position:fixed',
    'right:16px',
    'width:330px',
    'z-index:2147483000',
  ];
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
  private launcherAnimationFrame: number | undefined;
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
    if (this.launcherAnimationFrame !== undefined) {
      window.cancelAnimationFrame(this.launcherAnimationFrame);
      this.launcherAnimationFrame = undefined;
    }
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
    frame.style.cssText = chatWidgetFrameStyles().join(';');
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
    launcher.dataset.supernizoLauncher = 'true';
    launcher.setAttribute('type', 'button');

    const fallbackBlob = document.createElement('span');
    fallbackBlob.ariaHidden = 'true';
    fallbackBlob.className = 'supernizo-chat-launcher__blob-fallback';
    const blobCanvas = document.createElement('canvas');
    blobCanvas.ariaHidden = 'true';
    blobCanvas.className = 'supernizo-chat-launcher__blob';
    const unreadBadge = document.createElement('span');
    unreadBadge.ariaHidden = 'true';
    unreadBadge.className = 'supernizo-chat-launcher__badge';
    launcher.append(fallbackBlob, blobCanvas, unreadBadge);

    launcher.style.cssText = [
      'appearance:none',
      'background:transparent',
      'border:0',
      'bottom:16px',
      'cursor:pointer',
      'height:72px',
      'isolation:isolate',
      'padding:0',
      'position:fixed',
      'right:16px',
      'transition:transform .16s ease',
      'width:72px',
      'z-index:2147482999',
    ].join(';');
    launcher.addEventListener('click', () => this.openChat());
    launcher.addEventListener('mouseenter', () => {
      launcher.style.transform = 'translateY(-2px) scale(1.03)';
    });
    launcher.addEventListener('mouseleave', () => {
      launcher.style.transform = '';
    });
    (document.body ?? document.documentElement).append(launcher);
    this.launcher = launcher;
    this.startLauncherBlobAnimation(blobCanvas);

    const style = document.createElement('style');
    style.dataset.supernizoChatLauncher = 'true';
    style.textContent = `
      .supernizo-chat-launcher__blob-fallback { background:#18181b; border-radius:48% 52% 43% 57% / 55% 44% 56% 45%; height:48px; inset:12px; position:absolute; transform:rotate(-8deg); width:50px; z-index:0; }
      .supernizo-chat-launcher__blob { filter:drop-shadow(0 7px 10px rgba(0,0,0,.24)) drop-shadow(0 0 .75px rgba(255,255,255,.5)); height:68px; inset:2px; pointer-events:none; position:absolute; transition:filter .16s ease; width:68px; z-index:1; }
      .supernizo-chat-launcher__badge { background:#55b982; border:2px solid #f4f4f5; border-radius:999px; bottom:7px; display:none; height:10px; position:absolute; right:7px; width:10px; z-index:2; }
      button[data-supernizo-unread='true'] .supernizo-chat-launcher__badge { display:block; }
      button[aria-label='Open chat with the event team']:focus { outline:none; }
      button[aria-label='Open chat with the event team']:focus-visible .supernizo-chat-launcher__blob { filter:drop-shadow(0 7px 10px rgba(0,0,0,.24)) drop-shadow(0 0 3px #fff) drop-shadow(0 0 2px #18181b); }
      @media (prefers-reduced-motion: reduce) { button[aria-label='Open chat with the event team'] { transition:none !important; } }
    `;
    (document.head ?? document.documentElement).append(style);
    this.launcherStyle = style;
  }

  private startLauncherBlobAnimation(canvas: HTMLCanvasElement): void {
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    const size = 68;
    canvas.height = size * pixelRatio;
    canvas.width = size * pixelRatio;
    const context = canvas.getContext('2d');
    if (!context) return;
    context.scale(pixelRatio, pixelRatio);
    const surface = context.createRadialGradient(24, 21, 2, 36, 38, 30);
    surface.addColorStop(0, '#3a3a3d');
    surface.addColorStop(0.52, '#252528');
    surface.addColorStop(1, '#111113');

    const drawEye = (
      x: number,
      y: number,
      radiusX: number,
      radiusY: number,
      gazeX: number,
      gazeY: number,
    ) => {
      context.beginPath();
      context.ellipse(x, y, radiusX, radiusY, 0, 0, Math.PI * 2);
      context.fillStyle = '#f4f3ed';
      context.fill();
      context.save();
      context.clip();
      context.beginPath();
      context.ellipse(x + gazeX, y + gazeY, 1.7, Math.max(0.45, radiusY * 0.38), 0, 0, Math.PI * 2);
      context.fillStyle = '#18181b';
      context.fill();
      context.restore();
    };

    const render = (timestamp: number) => {
      const elapsed = timestamp / 1_000;
      context.clearRect(0, 0, size, size);
      context.beginPath();
      const centerX = size / 2 + Math.sin(elapsed * 0.82) * 2.2;
      const centerY = size / 2 + Math.cos(elapsed * 0.67) * 1.8;
      for (let index = 0; index <= 64; index += 1) {
        const angle = (index / 64) * Math.PI * 2;
        const radius =
          24 *
          (1 +
            Math.sin(angle * 3 + elapsed * 1.28) * 0.13 +
            Math.sin(angle * 5 - elapsed * 0.92) * 0.08 +
            Math.sin(angle * 2 + elapsed * 0.58) * 0.055);
        const x = centerX + Math.cos(angle) * radius;
        const y = centerY + Math.sin(angle) * radius;
        if (index === 0) context.moveTo(x, y);
        else context.lineTo(x, y);
      }
      context.closePath();
      context.fillStyle = surface;
      context.fill();
      context.lineWidth = 0.75;
      context.strokeStyle = '#09090b';
      context.stroke();

      const blinkPhase = (elapsed + 1.2) % 4.6;
      const blinkScale = blinkPhase < 0.18 ? 1 - Math.sin((blinkPhase / 0.18) * Math.PI) * 0.88 : 1;
      const gazeX = Math.sin(elapsed * 0.72) * 1.25;
      const gazeY = Math.sin(elapsed * 0.47 + 0.6) * 0.85;
      drawEye(centerX - 7.4, centerY - 3.2, 4.15, 5.1 * blinkScale, gazeX, gazeY);
      drawEye(centerX + 7.8, centerY - 2.5, 3.85, 4.65 * blinkScale, gazeX, gazeY);

      this.launcherAnimationFrame = window.requestAnimationFrame(render);
    };

    render(0);
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      if (this.launcherAnimationFrame !== undefined) {
        window.cancelAnimationFrame(this.launcherAnimationFrame);
        this.launcherAnimationFrame = undefined;
      }
    }
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
