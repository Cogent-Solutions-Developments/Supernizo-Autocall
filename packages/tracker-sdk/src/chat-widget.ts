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

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const media = document.createElement('span');
    media.ariaHidden = 'true';
    media.className = 'supernizo-chat-launcher__media';
    const identityVideo = document.createElement('video');
    identityVideo.ariaHidden = 'true';
    identityVideo.autoplay = !reducedMotion;
    identityVideo.className = 'supernizo-chat-launcher__video';
    identityVideo.disablePictureInPicture = true;
    identityVideo.loop = true;
    identityVideo.muted = true;
    identityVideo.playsInline = true;
    identityVideo.poster = new URL(
      '/sdk/assets/cta-hover-loop1-poster.jpg',
      this.bootstrapEndpoint,
    ).toString();
    identityVideo.preload = reducedMotion ? 'metadata' : 'auto';
    identityVideo.src = new URL(
      '/sdk/assets/cta-hover-loop1.mp4',
      this.bootstrapEndpoint,
    ).toString();

    media.append(identityVideo);

    const footer = document.createElement('span');
    footer.ariaHidden = 'true';
    footer.className = 'supernizo-chat-launcher__footer';
    const profile = document.createElement('span');
    profile.className = 'supernizo-chat-launcher__profile';
    const avatarWrap = document.createElement('span');
    avatarWrap.className = 'supernizo-chat-launcher__avatar-wrap';
    const avatar = document.createElement('img');
    avatar.alt = '';
    avatar.className = 'supernizo-chat-launcher__avatar';
    avatar.src = identityVideo.poster;
    const onlineIndicator = document.createElement('span');
    onlineIndicator.className = 'supernizo-chat-launcher__online-indicator';
    avatarWrap.append(avatar, onlineIndicator);
    const profileCopy = document.createElement('span');
    profileCopy.className = 'supernizo-chat-launcher__profile-copy';
    const profileName = document.createElement('strong');
    profileName.textContent = 'Soniya Sahanya';
    const profileStatus = document.createElement('span');
    profileStatus.textContent = 'Ready to help';
    profileCopy.append(profileName, profileStatus);
    profile.append(avatarWrap, profileCopy);
    const action = document.createElement('span');
    action.className = 'supernizo-chat-launcher__action';
    const actionIcon = document.createElement('span');
    actionIcon.className = 'supernizo-chat-launcher__action-icon';
    actionIcon.textContent = '+';
    const actionLabel = document.createElement('span');
    actionLabel.textContent = 'Chat';
    action.append(actionIcon, actionLabel);
    footer.append(profile, action);

    const unreadBadge = document.createElement('span');
    unreadBadge.ariaHidden = 'true';
    unreadBadge.className = 'supernizo-chat-launcher__badge';
    launcher.append(media, footer, unreadBadge);

    const launcherShadow = '0 22px 55px rgba(24,24,27,.18),0 3px 10px rgba(24,24,27,.08)';
    launcher.style.cssText = [
      'appearance:none',
      'background:#fff',
      'border:1px solid rgba(24,24,27,.12)',
      'border-radius:18px',
      'bottom:16px',
      `box-shadow:${launcherShadow}`,
      'box-sizing:border-box',
      'cursor:pointer',
      'display:grid',
      'grid-template-rows:200px 48px',
      'height:264px',
      'isolation:isolate',
      'max-width:calc(100vw - 32px)',
      'overflow:hidden',
      'padding:7px',
      'position:fixed',
      'right:16px',
      'text-align:left',
      'transition:box-shadow .22s ease,transform .22s cubic-bezier(.2,.8,.2,1)',
      'width:204px',
      'z-index:2147482999',
    ].join(';');
    launcher.addEventListener('click', () => this.openChat());
    launcher.addEventListener('mouseenter', () => {
      launcher.style.boxShadow = '0 26px 64px rgba(24,24,27,.22),0 4px 12px rgba(24,24,27,.09)';
      launcher.style.transform = 'translateY(-3px) scale(1.012)';
    });
    launcher.addEventListener('mouseleave', () => {
      launcher.style.boxShadow = launcherShadow;
      launcher.style.transform = '';
    });
    (document.body ?? document.documentElement).append(launcher);
    this.launcher = launcher;

    const style = document.createElement('style');
    style.dataset.supernizoChatLauncher = 'true';
    style.textContent = `
      button[data-supernizo-launcher='true'], button[data-supernizo-launcher='true'] *, button[data-supernizo-launcher='true'] *::before, button[data-supernizo-launcher='true'] *::after { box-sizing:border-box; }
      .supernizo-chat-launcher__media { background:#efefec; border-radius:12px; display:block; min-height:0; overflow:hidden; pointer-events:none; position:relative; width:100%; }
      .supernizo-chat-launcher__video { display:block; height:100%; inset:0; object-fit:cover; object-position:50% 18%; position:absolute; transform:scale(1.02); width:100%; }
      .supernizo-chat-launcher__footer { align-items:flex-end; display:flex; font-family:'Google Sans','Helvetica Neue',Arial,sans-serif; gap:8px; justify-content:space-between; min-height:0; padding:0 1px 1px 4px; pointer-events:none; width:100%; }
      .supernizo-chat-launcher__profile { align-items:center; display:flex; min-width:0; }
      .supernizo-chat-launcher__avatar-wrap { flex:0 0 auto; height:30px; position:relative; width:30px; }
      .supernizo-chat-launcher__avatar { border-radius:999px; display:block; height:30px; object-fit:cover; object-position:50% 18%; width:30px; }
      .supernizo-chat-launcher__online-indicator { background:#55c985; border:2px solid #fff; border-radius:999px; bottom:-1px; height:9px; position:absolute; right:-1px; width:9px; }
      .supernizo-chat-launcher__profile-copy { color:#18181b; display:flex; flex-direction:column; line-height:1.1; margin-left:7px; min-width:0; overflow:hidden; white-space:nowrap; }
      .supernizo-chat-launcher__profile-copy strong { font-size:10.5px; font-weight:650; letter-spacing:-.01em; overflow:hidden; text-overflow:ellipsis; }
      .supernizo-chat-launcher__profile-copy > span { color:#85858d; font-size:9px; font-weight:500; margin-top:4px; }
      .supernizo-chat-launcher__action { align-items:center; background:#18181b; border-radius:10px; color:#fff; display:flex; flex:0 0 auto; font-size:11px; font-weight:600; gap:5px; height:36px; justify-content:center; padding:0 10px; }
      .supernizo-chat-launcher__action-icon { font-size:17px; font-weight:300; line-height:1; margin-top:-1px; }
      .supernizo-chat-launcher__badge { background:#ff3b4e; border:2px solid #fff; border-radius:999px; display:none; height:12px; position:absolute; right:10px; top:10px; width:12px; z-index:3; }
      button[data-supernizo-unread='true'] .supernizo-chat-launcher__badge { display:block; }
      button[aria-label='Open chat with the event team']:focus { outline:none; }
      button[aria-label='Open chat with the event team']:focus-visible { box-shadow:0 22px 55px rgba(24,24,27,.18),0 0 0 3px #fff,0 0 0 5px #18181b !important; }
      @media (max-width:420px) { button[aria-label='Open chat with the event team'] { grid-template-rows:196px 48px !important; height:260px !important; width:200px !important; } }
      @media (prefers-reduced-motion: reduce) { button[aria-label='Open chat with the event team'] { transition:none !important; } }
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
