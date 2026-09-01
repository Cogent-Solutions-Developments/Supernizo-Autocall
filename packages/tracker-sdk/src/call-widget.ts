import type { TrackingContext } from '@supernizo/shared';

type Call = Readonly<{
  agentAvatarUrl?: string | null;
  agentDisplayName: string | null;
  id: string;
  requestedAt: string;
  roomName: string;
  siteId: string;
  status: string;
  type: 'AUDIO' | 'VIDEO';
  visitorId: string;
}>;

type CallWidgetConfig = Readonly<{ channel: string; token: string }>;
type LiveKitMedia = Readonly<{ token: string; url: string }>;

// The call interface runs in a cross-origin iframe. The host page must
// explicitly delegate these features before that interface can request them.
export const CALL_WIDGET_PERMISSIONS_POLICY = 'microphone; camera';

export function callWidgetFrameStyles(visible: boolean): readonly string[] {
  return [
    'background:transparent',
    'border:0',
    'bottom:16px',
    `height:${visible ? '560px' : '1px'}`,
    `max-width:${visible ? 'calc(100vw - 32px)' : '1px'}`,
    `pointer-events:${visible ? 'auto' : 'none'}`,
    'position:fixed',
    'right:16px',
    `width:${visible ? '360px' : '1px'}`,
    'z-index:2147483001',
  ];
}

function isCall(value: unknown): value is Call {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<Call>;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.siteId === 'string' &&
    typeof candidate.visitorId === 'string' &&
    (candidate.type === 'AUDIO' || candidate.type === 'VIDEO') &&
    typeof candidate.status === 'string'
  );
}

function isLiveKitMedia(value: unknown): value is LiveKitMedia {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<LiveKitMedia>;
  return typeof candidate.token === 'string' && typeof candidate.url === 'string';
}

export class CallWidgetController {
  private frame: HTMLIFrameElement | undefined;
  private syncTimer: number | undefined;

  public constructor(
    private readonly context: TrackingContext,
    private readonly endpoint: string,
    private readonly config: CallWidgetConfig,
  ) {}

  public start(): void {
    try {
      if (this.frame) return;
      const widgetUrl = new URL('/widget/call', this.endpoint);
      widgetUrl.searchParams.set('host_origin', window.location.origin);
      const frame = document.createElement('iframe');
      frame.setAttribute('aria-label', 'Incoming calls');
      frame.setAttribute('title', 'Incoming calls');
      frame.allow = CALL_WIDGET_PERMISSIONS_POLICY;
      frame.src = widgetUrl.toString();
      frame.style.cssText = callWidgetFrameStyles(false).join(';');
      frame.addEventListener('load', () => this.postConfig());
      window.addEventListener('message', this.receiveMessage);
      (document.body ?? document.documentElement).append(frame);
      this.frame = frame;
      this.syncTimer = window.setInterval(() => this.postConfig(), 3_000);
    } catch {
      // The optional call UI must not interrupt the tracked website.
    }
  }

  public stop(): void {
    if (this.syncTimer !== undefined) {
      window.clearInterval(this.syncTimer);
      this.syncTimer = undefined;
    }
    window.removeEventListener('message', this.receiveMessage);
    this.frame?.remove();
    this.frame = undefined;
  }

  private readonly receiveMessage = (event: MessageEvent<unknown>): void => {
    if (
      event.origin !== new URL(this.endpoint).origin ||
      event.source !== this.frame?.contentWindow ||
      !event.data ||
      typeof event.data !== 'object'
    ) {
      return;
    }
    const data = event.data as {
      action?: unknown;
      call?: unknown;
      type?: unknown;
      visible?: unknown;
    };
    if (data.type === 'supernizo-call-visibility' && typeof data.visible === 'boolean') {
      this.setFrameVisibility(data.visible);
      return;
    }
    if (data.type === 'supernizo-call-ready') {
      this.postConfig();
      return;
    }
    if (
      data.type === 'supernizo-call-action' &&
      (data.action === 'accept' || data.action === 'reject') &&
      isCall(data.call)
    ) {
      void this.respond(data.call, data.action);
    }
    if (data.type === 'supernizo-call-end' && isCall(data.call)) {
      void this.respond(data.call, 'end');
    }
  };

  private postConfig(): void {
    this.frame?.contentWindow?.postMessage(
      { config: this.config, type: 'supernizo-call-config' },
      new URL(this.endpoint).origin,
    );
  }

  private setFrameVisibility(visible: boolean): void {
    if (!this.frame) return;
    this.frame.style.cssText = callWidgetFrameStyles(visible).join(';');
  }

  private async respond(call: Call, action: 'accept' | 'end' | 'reject'): Promise<void> {
    try {
      const response = await fetch(new URL(`/api/calls/${call.id}/${action}`, this.endpoint), {
        body: JSON.stringify({ context: this.context }),
        credentials: 'omit',
        headers: { 'content-type': 'text/plain;charset=UTF-8' },
        keepalive: true,
        method: 'POST',
        mode: 'cors',
      });
      if (!response.ok) return;
      const body: unknown = await response.json();
      if (!body || typeof body !== 'object' || !('data' in body) || !isCall(body.data)) return;
      this.frame?.contentWindow?.postMessage(
        { call: body.data, type: 'supernizo-call-status' },
        new URL(this.endpoint).origin,
      );
      if (action === 'accept') await this.requestMedia(body.data);
    } catch {
      // The host page remains unaffected when the calling API is unavailable.
    }
  }

  private async requestMedia(call: Call): Promise<void> {
    try {
      const response = await fetch(new URL('/api/livekit/token', this.endpoint), {
        body: JSON.stringify({
          callId: call.id,
          context: this.context,
          participantRole: 'VISITOR',
        }),
        credentials: 'omit',
        headers: { 'content-type': 'text/plain;charset=UTF-8' },
        keepalive: true,
        method: 'POST',
        mode: 'cors',
      });
      if (!response.ok) return;
      const body: unknown = await response.json();
      if (!body || typeof body !== 'object' || !('data' in body) || !isLiveKitMedia(body.data))
        return;
      this.frame?.contentWindow?.postMessage(
        { media: body.data, type: 'supernizo-call-media' },
        new URL(this.endpoint).origin,
      );
    } catch {
      // A token failure must not affect the tracked website.
    }
  }
}
