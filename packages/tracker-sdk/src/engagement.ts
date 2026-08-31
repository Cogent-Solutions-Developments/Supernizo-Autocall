export const HEARTBEAT_INTERVAL_MS = 15_000;
export const IDLE_THRESHOLD_MS = 60_000;

export type TrackingContext = Readonly<{
  sessionId: string;
  sitePublicKey: string;
  visitorId: string;
}>;

type PageState = Readonly<{
  id: string;
  maxScrollPercent: number;
  path: string;
  title: string;
  url: string;
}>;

type SafeMetadataValue = string | number | boolean | null;
export type SafeMetadata = Readonly<Record<string, SafeMetadataValue>>;

export class ActiveTimeAccumulator {
  private accumulatedMilliseconds = 0;
  private lastActivityAt: number;
  private lastMeasuredAt: number;
  private visible: boolean;

  public constructor(now: number, visible: boolean) {
    this.lastActivityAt = now;
    this.lastMeasuredAt = now;
    this.visible = visible;
  }

  public recordActivity(now: number): void {
    this.advance(now);
    this.lastActivityAt = now;
  }

  public setVisibility(visible: boolean, now: number): void {
    this.advance(now);
    this.visible = visible;
  }

  public drainWholeSeconds(now: number): number {
    this.advance(now);
    const wholeSeconds = Math.floor(this.accumulatedMilliseconds / 1_000);
    this.accumulatedMilliseconds -= wholeSeconds * 1_000;
    return wholeSeconds;
  }

  private advance(now: number): void {
    if (now <= this.lastMeasuredAt) {
      return;
    }

    if (this.visible) {
      const activeUntil = Math.min(now, this.lastActivityAt + IDLE_THRESHOLD_MS);
      if (activeUntil > this.lastMeasuredAt) {
        this.accumulatedMilliseconds += activeUntil - this.lastMeasuredAt;
      }
    }

    this.lastMeasuredAt = now;
  }
}

export function serializeBeaconPayload(payload: object): Blob {
  return new Blob([JSON.stringify(payload)], { type: 'text/plain;charset=UTF-8' });
}

export function sanitizeEventMetadata(value: unknown): SafeMetadata {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  const metadata: Record<string, SafeMetadataValue> = {};
  for (const [key, candidate] of Object.entries(value).slice(0, 20)) {
    if (!key.trim() || key.length > 64) {
      continue;
    }

    if (typeof candidate === 'string') {
      metadata[key] = candidate.slice(0, 256);
    } else if (typeof candidate === 'number' && Number.isFinite(candidate)) {
      metadata[key] = candidate;
    } else if (typeof candidate === 'boolean' || candidate === null) {
      metadata[key] = candidate;
    }
  }

  return metadata;
}

export function hasNavigationChanged(previousUrl: string, nextUrl: string): boolean {
  return previousUrl !== nextUrl;
}

export class EngagementManager {
  private accumulator: ActiveTimeAccumulator;
  private currentPage: PageState | undefined;
  private heartbeatTimer: number | undefined;
  private readonly observedScrollThresholds = new Set<number>();
  private originalPushState: History['pushState'] | undefined;
  private originalReplaceState: History['replaceState'] | undefined;

  public constructor(
    private readonly context: TrackingContext,
    private readonly bootstrapEndpoint: string,
    private readonly createIdentifier: () => string | undefined,
  ) {
    this.accumulator = new ActiveTimeAccumulator(Date.now(), document.visibilityState === 'visible');
  }

  public start(): void {
    this.startPage();
    this.heartbeatTimer = window.setInterval(() => this.sendHeartbeat(), HEARTBEAT_INTERVAL_MS);
    this.installLifecycleListeners();
  }

  public stop(): void {
    if (this.heartbeatTimer !== undefined) {
      window.clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = undefined;
    }

    this.restoreHistory();
  }

  public track(name: string, metadata?: unknown): void {
    const page = this.currentPage;
    const trimmedName = name.trim().slice(0, 128);
    if (!page || !trimmedName) {
      return;
    }

    this.send('event', {
      ...this.context,
      metadata: sanitizeEventMetadata(metadata),
      name: trimmedName,
      pageViewId: page.id,
      type: 'custom',
    });
  }

  private endpoint(path: 'event' | 'heartbeat' | 'page' | 'page/leave'): string {
    return new URL(`/api/track/${path}`, this.bootstrapEndpoint).toString();
  }

  private startPage(): void {
    const id = this.createIdentifier();
    if (!id) {
      return;
    }

    const url = window.location.href;
    const page: PageState = {
      id,
      maxScrollPercent: this.readScrollPercent(),
      path: `${window.location.pathname}${window.location.search}${window.location.hash}`,
      title: document.title.slice(0, 512),
      url,
    };
    this.currentPage = page;
    this.observedScrollThresholds.clear();
    this.accumulator = new ActiveTimeAccumulator(Date.now(), document.visibilityState === 'visible');

    this.send('page', { ...this.context, ...page, pageViewId: page.id });
  }

  private finishPage(useBeacon: boolean): void {
    const page = this.currentPage;
    if (!page) {
      return;
    }

    this.send(
      'page/leave',
      {
        ...this.context,
        activeSecondsDelta: this.accumulator.drainWholeSeconds(Date.now()),
        maxScrollPercent: page.maxScrollPercent,
        pageViewId: page.id,
      },
      useBeacon,
    );
    this.currentPage = undefined;
  }

  private sendHeartbeat(force = false): void {
    const page = this.currentPage;
    if (!page || (!force && document.visibilityState !== 'visible')) {
      return;
    }

    this.send('heartbeat', {
      ...this.context,
      activeSecondsDelta: this.accumulator.drainWholeSeconds(Date.now()),
      maxScrollPercent: page.maxScrollPercent,
      pageViewId: page.id,
    });
  }

  private send(
    path: 'event' | 'heartbeat' | 'page' | 'page/leave',
    payload: object,
    useBeacon = false,
  ): void {
    try {
      const endpoint = this.endpoint(path);
      if (useBeacon && typeof navigator.sendBeacon === 'function') {
        navigator.sendBeacon(endpoint, serializeBeaconPayload(payload));
        return;
      }

      void fetch(endpoint, {
        body: JSON.stringify(payload),
        credentials: 'omit',
        headers: { 'content-type': 'text/plain;charset=UTF-8' },
        keepalive: useBeacon,
        method: 'POST',
        mode: 'cors',
      }).catch(() => undefined);
    } catch {
      // Tracking must never interrupt the host page.
    }
  }

  private installLifecycleListeners(): void {
    const activityEvents = ['keydown', 'pointerdown', 'scroll', 'touchstart'] as const;
    for (const eventName of activityEvents) {
      window.addEventListener(eventName, () => this.accumulator.recordActivity(Date.now()), {
        passive: true,
      });
    }

    document.addEventListener('visibilitychange', () => {
      this.accumulator.setVisibility(document.visibilityState === 'visible', Date.now());
      if (document.visibilityState === 'hidden') {
        this.sendHeartbeat(true);
      }
    });
    window.addEventListener('pagehide', () => this.finishPage(true), { passive: true });
    window.addEventListener('popstate', () => this.handleNavigation(), { passive: true });
    window.addEventListener('hashchange', () => this.handleNavigation(), { passive: true });
    window.addEventListener('scroll', () => this.handleScroll(), { passive: true });
    document.addEventListener('click', (event) => this.handleConfiguredClick(event));

    this.patchHistory();
  }

  private patchHistory(): void {
    this.originalPushState = history.pushState;
    this.originalReplaceState = history.replaceState;
    const notify = () => this.handleNavigation();

    history.pushState = (...argumentsList: Parameters<History['pushState']>): void => {
      this.originalPushState?.apply(history, argumentsList);
      notify();
    };
    history.replaceState = (...argumentsList: Parameters<History['replaceState']>): void => {
      this.originalReplaceState?.apply(history, argumentsList);
      notify();
    };
  }

  private restoreHistory(): void {
    if (this.originalPushState) {
      history.pushState = this.originalPushState;
    }
    if (this.originalReplaceState) {
      history.replaceState = this.originalReplaceState;
    }
  }

  private handleNavigation(): void {
    const currentUrl = this.currentPage?.url;
    if (!currentUrl || !hasNavigationChanged(currentUrl, window.location.href)) {
      return;
    }

    this.finishPage(false);
    this.startPage();
  }

  private handleScroll(): void {
    const page = this.currentPage;
    if (!page) {
      return;
    }

    const maxScrollPercent = Math.max(page.maxScrollPercent, this.readScrollPercent());
    this.currentPage = { ...page, maxScrollPercent };
    const threshold = [25, 50, 75, 100].find(
      (candidate) => maxScrollPercent >= candidate && !this.observedScrollThresholds.has(candidate),
    );
    if (threshold === undefined) {
      return;
    }

    this.observedScrollThresholds.add(threshold);
    this.send('event', {
      ...this.context,
      metadata: { percent: threshold },
      name: 'scroll_depth',
      pageViewId: page.id,
      type: 'scroll_depth',
    });
  }

  private handleConfiguredClick(event: MouseEvent): void {
    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }

    const configuredElement = target.closest<HTMLElement>('[data-engage-event]');
    const eventName = configuredElement?.dataset.engageEvent?.trim();
    if (!eventName) {
      return;
    }

    const page = this.currentPage;
    if (!page) {
      return;
    }

    this.send('event', {
      ...this.context,
      metadata: {},
      name: eventName.slice(0, 128),
      pageViewId: page.id,
      type: 'cta_click',
    });
  }

  private readScrollPercent(): number {
    const scrollingElement = document.scrollingElement ?? document.documentElement;
    const scrollableHeight = scrollingElement.scrollHeight - window.innerHeight;
    if (scrollableHeight <= 0) {
      return 100;
    }

    return Math.min(100, Math.max(0, Math.round((window.scrollY / scrollableHeight) * 100)));
  }
}
