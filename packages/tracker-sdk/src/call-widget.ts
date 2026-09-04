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

export type CallWidgetConfig = Readonly<{
  channel: string;
  livekitUrl?: string | undefined;
  token: string;
}>;
type LiveKitMedia = Readonly<{ token: string; url: string }>;

const CONFIG_REFRESH_AFTER_MS = 45 * 60 * 1_000;
const CONFIG_REFRESH_RETRY_MS = 60 * 1_000;
const CONFIG_REFRESH_TICK_MS = 60 * 1_000;
const MOTION_EASE_OUT = 'cubic-bezier(0.23, 1, 0.32, 1)';
const MOTION_EASE_HANDOFF = 'cubic-bezier(0.65, 0, 0.35, 1)';
const MOTION_HANDOFF_DURATION_MS = 680;
const MOTION_LAYOUT_DURATION_MS = 260;

export type CallWidgetFrameLayout = 'connected-audio' | 'connected-video' | 'default';

export function callWidgetFrameHeight(layout: CallWidgetFrameLayout): string {
  const height =
    layout === 'connected-audio' ? '252px' : layout === 'connected-video' ? '490px' : '540px';
  return `min(${height}, calc(100vh - 32px))`;
}

function callFrameEnterKeyframes(
  frame: HTMLIFrameElement,
  launcher: HTMLButtonElement | null,
): Keyframe[] {
  const frameRect = frame.getBoundingClientRect();
  const launcherRect = launcher?.getBoundingClientRect();
  const scaleX = launcherRect ? Math.min(1, launcherRect.width / frameRect.width) : 0.7;
  const scaleY = launcherRect ? Math.min(1, launcherRect.height / frameRect.height) : 0.62;
  const compactTransform = `translate3d(0, 0, 0) scale3d(${scaleX}, ${scaleY}, 1)`;

  return [
    {
      filter: 'blur(1px)',
      offset: 0,
      opacity: 0,
      transform: compactTransform,
    },
    {
      filter: 'blur(0)',
      offset: 0.2,
      opacity: 0.28,
      transform: compactTransform,
    },
    {
      filter: 'blur(0)',
      offset: 0.82,
      opacity: 1,
      transform: 'translate3d(0, 0, 0) scale3d(.985, .985, 1)',
    },
    {
      filter: 'blur(0)',
      offset: 1,
      opacity: 1,
      transform: 'translate3d(0, 0, 0) scale3d(1, 1, 1)',
    },
  ];
}

export function isCallWidgetConfigRefreshDue(
  lastRefreshAt: number,
  lastAttemptAt: number,
  now = Date.now(),
): boolean {
  return (
    now - lastRefreshAt >= CONFIG_REFRESH_AFTER_MS && now - lastAttemptAt >= CONFIG_REFRESH_RETRY_MS
  );
}

// The call interface runs in a cross-origin iframe. The host page must
// explicitly delegate these features before that interface can request them.
export const CALL_WIDGET_PERMISSIONS_POLICY = 'microphone; camera';

export function callWidgetFrameStyles(
  visible: boolean,
  layout: CallWidgetFrameLayout = 'default',
): readonly string[] {
  return [
    'background:transparent',
    'border:0',
    'border-radius:18px',
    'bottom:16px',
    `height:${visible ? callWidgetFrameHeight(layout) : '1px'}`,
    `max-width:${visible ? 'calc(100vw - 32px)' : '1px'}`,
    'overflow:hidden',
    `opacity:${visible ? '1' : '0'}`,
    `pointer-events:${visible ? 'auto' : 'none'}`,
    'position:fixed',
    'right:16px',
    'transform-origin:bottom right',
    `width:${visible ? '350px' : '1px'}`,
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

function isCallWidgetFrameLayout(value: unknown): value is CallWidgetFrameLayout {
  return value === 'connected-audio' || value === 'connected-video' || value === 'default';
}

export function readCallActionResponse(
  value: unknown,
): Readonly<{ call: Call; media?: LiveKitMedia }> | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const candidate = value as Readonly<{ data?: unknown; media?: unknown }>;
  if (!isCall(candidate.data)) return undefined;
  return {
    call: candidate.data,
    ...(isLiveKitMedia(candidate.media) ? { media: candidate.media } : {}),
  };
}

export class CallWidgetController {
  private frame: HTMLIFrameElement | undefined;
  private frameAnimation: Animation | undefined;
  private frameLayout: CallWidgetFrameLayout = 'default';
  private frameVisible = false;
  private configRefreshTimer: number | undefined;
  private configRefreshInFlight = false;
  private lastConfigRefreshAt = Date.now();
  private lastConfigRefreshAttemptAt = 0;
  private launcherAnimation: Animation | undefined;
  private syncTimer: number | undefined;

  public constructor(
    private readonly context: TrackingContext,
    private readonly endpoint: string,
    private config: CallWidgetConfig,
    private readonly renewConfig?: () => Promise<CallWidgetConfig | undefined>,
    private readonly onVisibilityChange?: (visible: boolean) => void,
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
      this.configRefreshTimer = window.setInterval(
        () => void this.refreshConfigIfDue(),
        CONFIG_REFRESH_TICK_MS,
      );
      document.addEventListener('visibilitychange', this.refreshConfigWhenVisible);
    } catch {
      // The optional call UI must not interrupt the tracked website.
    }
  }

  public stop(): void {
    if (this.syncTimer !== undefined) {
      window.clearInterval(this.syncTimer);
      this.syncTimer = undefined;
    }
    if (this.configRefreshTimer !== undefined) {
      window.clearInterval(this.configRefreshTimer);
      this.configRefreshTimer = undefined;
    }
    document.removeEventListener('visibilitychange', this.refreshConfigWhenVisible);
    window.removeEventListener('message', this.receiveMessage);
    this.frameAnimation?.cancel();
    this.frameAnimation = undefined;
    this.launcherAnimation?.cancel();
    this.launcherAnimation = undefined;
    const launcher = this.findLauncher();
    if (launcher) {
      launcher.style.opacity = '';
      launcher.style.pointerEvents = '';
      launcher.style.zIndex = '2147482999';
    }
    this.frame?.remove();
    this.frame = undefined;
    this.frameVisible = false;
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
      failureCode?: unknown;
      layout?: unknown;
      type?: unknown;
      visible?: unknown;
    };
    if (data.type === 'supernizo-call-visibility' && typeof data.visible === 'boolean') {
      this.setFrameVisibility(data.visible);
      return;
    }
    if (data.type === 'supernizo-call-layout' && isCallWidgetFrameLayout(data.layout)) {
      this.setFrameLayout(data.layout);
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
    if (
      data.type === 'supernizo-call-media-failure' &&
      isCall(data.call) &&
      (data.failureCode === 'MEDIA_CAMERA_PERMISSION_DENIED' ||
        data.failureCode === 'MEDIA_DEVICE_UNAVAILABLE' ||
        data.failureCode === 'MEDIA_MICROPHONE_PERMISSION_DENIED')
    ) {
      void this.reportMediaFailure(data.call, data.failureCode);
    }
  };

  private readonly refreshConfigWhenVisible = (): void => {
    if (document.visibilityState === 'visible') void this.refreshConfigIfDue();
  };

  private async refreshConfigIfDue(): Promise<void> {
    const now = Date.now();
    if (
      !this.renewConfig ||
      this.configRefreshInFlight ||
      !isCallWidgetConfigRefreshDue(this.lastConfigRefreshAt, this.lastConfigRefreshAttemptAt, now)
    ) {
      return;
    }

    this.configRefreshInFlight = true;
    this.lastConfigRefreshAttemptAt = now;
    try {
      const refreshed = await this.renewConfig();
      if (!refreshed) return;
      this.config = refreshed;
      this.lastConfigRefreshAt = Date.now();
      this.postConfig();
    } catch {
      // Credential renewal retries after a short backoff without affecting the host page.
    } finally {
      this.configRefreshInFlight = false;
    }
  }

  private postConfig(): void {
    this.frame?.contentWindow?.postMessage(
      { config: this.config, type: 'supernizo-call-config' },
      new URL(this.endpoint).origin,
    );
  }

  private setFrameVisibility(visible: boolean): void {
    if (!this.frame || visible === this.frameVisible) return;
    this.frameVisible = visible;
    this.onVisibilityChange?.(visible);
    this.frameAnimation?.cancel();
    this.frameAnimation = undefined;
    this.frame.style.cssText = callWidgetFrameStyles(visible, this.frameLayout).join(';');

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (visible && typeof this.frame.animate === 'function') {
      this.frameAnimation = this.frame.animate(
        reducedMotion
          ? [{ opacity: 0 }, { opacity: 1 }]
          : callFrameEnterKeyframes(this.frame, this.findLauncher()),
        {
          duration: reducedMotion ? 140 : MOTION_HANDOFF_DURATION_MS,
          easing: reducedMotion ? MOTION_EASE_OUT : MOTION_EASE_HANDOFF,
          fill: 'both',
        },
      );
    }

    this.setLauncherVisible(!visible, reducedMotion);
  }

  private setFrameLayout(layout: CallWidgetFrameLayout): void {
    if (!this.frame || layout === this.frameLayout) return;
    this.frameLayout = layout;
    if (!this.frameVisible) return;

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.frame.style.transition = reducedMotion
      ? 'none'
      : `height ${MOTION_LAYOUT_DURATION_MS}ms ${MOTION_EASE_HANDOFF}`;
    this.frame.style.height = callWidgetFrameHeight(layout);
  }

  private findLauncher(): HTMLButtonElement | null {
    return document.querySelector<HTMLButtonElement>('[data-supernizo-launcher="true"]');
  }

  private setLauncherVisible(visible: boolean, reducedMotion: boolean): void {
    const launcher = this.findLauncher();
    if (!launcher) return;

    this.launcherAnimation?.cancel();
    this.launcherAnimation = undefined;
    launcher.style.pointerEvents = visible ? '' : 'none';

    if (typeof launcher.animate !== 'function') {
      launcher.style.opacity = visible ? '1' : '0';
      return;
    }

    if (!visible && !reducedMotion && this.frame) {
      launcher.style.zIndex = '2147483002';

      const animation = launcher.animate(
        [
          {
            offset: 0,
            opacity: 1,
            transform: 'translate3d(0, 0, 0) scale(1)',
          },
          {
            offset: 0.42,
            opacity: 1,
            transform: 'translate3d(0, 0, 0) scale(1.008)',
          },
          {
            offset: 0.78,
            opacity: 0.76,
            transform: 'translate3d(0, 1px, 0) scale(1.014)',
          },
          {
            offset: 1,
            opacity: 0,
            transform: 'translate3d(0, 3px, 0) scale(1.018)',
          },
        ],
        {
          duration: MOTION_HANDOFF_DURATION_MS,
          easing: MOTION_EASE_HANDOFF,
          fill: 'both',
        },
      );
      this.launcherAnimation = animation;
      animation.addEventListener(
        'finish',
        () => {
          if (this.launcherAnimation === animation) launcher.style.zIndex = '2147482999';
        },
        { once: true },
      );
      return;
    }

    launcher.style.zIndex = '2147482999';
    const hiddenFrame: Keyframe = reducedMotion
      ? { opacity: 0 }
      : { opacity: 0, transform: 'translate3d(0, 7px, 0) scale(0.96)' };
    const visibleFrame: Keyframe = reducedMotion
      ? { opacity: 1 }
      : { opacity: 1, transform: 'translate3d(0, 0, 0) scale(1)' };
    this.launcherAnimation = launcher.animate(
      visible ? [hiddenFrame, visibleFrame] : [visibleFrame, hiddenFrame],
      {
        duration: reducedMotion ? 120 : visible ? 280 : 180,
        easing: MOTION_EASE_OUT,
        fill: 'both',
      },
    );
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
      if (!response.ok) {
        this.postActionError(call, action);
        return;
      }
      const body: unknown = await response.json();
      const actionResponse = readCallActionResponse(body);
      if (!actionResponse) {
        this.postActionError(call, action);
        return;
      }
      this.frame?.contentWindow?.postMessage(
        { call: actionResponse.call, type: 'supernizo-call-status' },
        new URL(this.endpoint).origin,
      );
      if (action === 'accept' && actionResponse.media) {
        this.postMedia(actionResponse.call.id, actionResponse.media);
        return;
      }
      if (action === 'accept') await this.requestMedia(actionResponse.call);
    } catch {
      this.postActionError(call, action);
      // The host page remains unaffected when the calling API is unavailable.
    }
  }

  private async reportMediaFailure(
    call: Call,
    failureCode:
      | 'MEDIA_CAMERA_PERMISSION_DENIED'
      | 'MEDIA_DEVICE_UNAVAILABLE'
      | 'MEDIA_MICROPHONE_PERMISSION_DENIED',
  ): Promise<void> {
    try {
      const response = await fetch(new URL(`/api/calls/${call.id}/fail`, this.endpoint), {
        body: JSON.stringify({ context: this.context, failureCode }),
        credentials: 'omit',
        headers: { 'content-type': 'text/plain;charset=UTF-8' },
        keepalive: true,
        method: 'POST',
        mode: 'cors',
      });
      if (!response.ok) return;
      const body: unknown = await response.json();
      const actionResponse = readCallActionResponse(body);
      if (!actionResponse) return;
      this.frame?.contentWindow?.postMessage(
        { call: actionResponse.call, type: 'supernizo-call-status' },
        new URL(this.endpoint).origin,
      );
    } catch {
      // Media failure reporting is best-effort and must not affect the host page.
    }
  }

  private postActionError(call: Call, action: 'accept' | 'end' | 'reject'): void {
    this.frame?.contentWindow?.postMessage(
      { action, callId: call.id, type: 'supernizo-call-action-error' },
      new URL(this.endpoint).origin,
    );
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
      this.postMedia(call.id, body.data);
    } catch {
      // A token failure must not affect the tracked website.
    }
  }

  private postMedia(callId: string, media: LiveKitMedia): void {
    this.frame?.contentWindow?.postMessage(
      { callId, media, type: 'supernizo-call-media' },
      new URL(this.endpoint).origin,
    );
  }
}
