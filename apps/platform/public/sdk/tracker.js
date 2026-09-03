(function () {
  const modules = {};
  const cache = {};
  const require = (name) => {
    if (cache[name]) return cache[name].exports;
    const module = { exports: {} };
    cache[name] = module;
    const factory = modules[name];
    if (!factory) throw new Error('Unknown tracker module: ' + name);
    factory(require, module.exports);
    return module.exports;
  };
  modules['./engagement'] = (require, exports) => {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EngagementManager = exports.SerialRequestQueue = exports.ActiveTimeAccumulator = exports.IDLE_THRESHOLD_MS = exports.HEARTBEAT_INTERVAL_MS = void 0;
exports.serializeBeaconPayload = serializeBeaconPayload;
exports.sanitizeEventMetadata = sanitizeEventMetadata;
exports.hasNavigationChanged = hasNavigationChanged;
exports.sendAfterPageRegistration = sendAfterPageRegistration;
exports.HEARTBEAT_INTERVAL_MS = 15_000;
exports.IDLE_THRESHOLD_MS = 60_000;
class ActiveTimeAccumulator {
    accumulatedMilliseconds = 0;
    lastActivityAt;
    lastMeasuredAt;
    visible;
    constructor(now, visible) {
        this.lastActivityAt = now;
        this.lastMeasuredAt = now;
        this.visible = visible;
    }
    recordActivity(now) {
        this.advance(now);
        this.lastActivityAt = now;
    }
    setVisibility(visible, now) {
        this.advance(now);
        this.visible = visible;
    }
    drainWholeSeconds(now) {
        this.advance(now);
        const wholeSeconds = Math.floor(this.accumulatedMilliseconds / 1_000);
        this.accumulatedMilliseconds -= wholeSeconds * 1_000;
        return wholeSeconds;
    }
    advance(now) {
        if (now <= this.lastMeasuredAt) {
            return;
        }
        if (this.visible) {
            const activeUntil = Math.min(now, this.lastActivityAt + exports.IDLE_THRESHOLD_MS);
            if (activeUntil > this.lastMeasuredAt) {
                this.accumulatedMilliseconds += activeUntil - this.lastMeasuredAt;
            }
        }
        this.lastMeasuredAt = now;
    }
}
exports.ActiveTimeAccumulator = ActiveTimeAccumulator;
function serializeBeaconPayload(payload) {
    return new Blob([JSON.stringify(payload)], { type: 'text/plain;charset=UTF-8' });
}
function sanitizeEventMetadata(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return {};
    }
    const metadata = {};
    for (const [key, candidate] of Object.entries(value).slice(0, 20)) {
        if (!key.trim() || key.length > 64) {
            continue;
        }
        if (typeof candidate === 'string') {
            metadata[key] = candidate.slice(0, 256);
        }
        else if (typeof candidate === 'number' && Number.isFinite(candidate)) {
            metadata[key] = candidate;
        }
        else if (typeof candidate === 'boolean' || candidate === null) {
            metadata[key] = candidate;
        }
    }
    return metadata;
}
function hasNavigationChanged(previousUrl, nextUrl) {
    return previousUrl !== nextUrl;
}
async function sendAfterPageRegistration(pageRegistered, send) {
    return (await pageRegistered) ? send() : undefined;
}
class SerialRequestQueue {
    tail = Promise.resolve();
    enqueue(request) {
        const pending = this.tail.then(request);
        this.tail = pending.then(() => undefined, () => undefined);
        return pending;
    }
}
exports.SerialRequestQueue = SerialRequestQueue;
class EngagementManager {
    context;
    bootstrapEndpoint;
    createIdentifier;
    accumulator;
    currentPage;
    pageRegistered = Promise.resolve(false);
    requestQueue = new SerialRequestQueue();
    heartbeatTimer;
    scrollSampleTimer;
    observedScrollThresholds = new Set();
    originalPushState;
    originalReplaceState;
    constructor(context, bootstrapEndpoint, createIdentifier) {
        this.context = context;
        this.bootstrapEndpoint = bootstrapEndpoint;
        this.createIdentifier = createIdentifier;
        this.accumulator = new ActiveTimeAccumulator(Date.now(), document.visibilityState === 'visible');
    }
    start() {
        this.startPage();
        this.sendHeartbeat(true);
        this.heartbeatTimer = window.setInterval(() => this.sendHeartbeat(), exports.HEARTBEAT_INTERVAL_MS);
        this.installLifecycleListeners();
    }
    stop() {
        if (this.heartbeatTimer !== undefined) {
            window.clearInterval(this.heartbeatTimer);
            this.heartbeatTimer = undefined;
        }
        if (this.scrollSampleTimer !== undefined) {
            window.clearTimeout(this.scrollSampleTimer);
            this.scrollSampleTimer = undefined;
        }
        this.restoreHistory();
    }
    track(name, metadata) {
        const page = this.currentPage;
        const trimmedName = name.trim().slice(0, 128);
        if (!page || !trimmedName) {
            return;
        }
        this.queuePageRequest(page, 'event', {
            ...this.context,
            metadata: sanitizeEventMetadata(metadata),
            name: trimmedName,
            pageViewId: page.id,
            type: 'custom',
        });
    }
    endpoint(path) {
        return new URL(`/api/track/${path}`, this.bootstrapEndpoint).toString();
    }
    startPage() {
        const id = this.createIdentifier();
        if (!id) {
            return;
        }
        const url = window.location.href;
        const page = {
            id,
            maxScrollPercent: this.readScrollPercent(),
            path: `${window.location.pathname}${window.location.search}${window.location.hash}`,
            title: document.title.slice(0, 512),
            url,
        };
        this.currentPage = page;
        this.observedScrollThresholds.clear();
        this.accumulator = new ActiveTimeAccumulator(Date.now(), document.visibilityState === 'visible');
        this.pageRegistered = this.requestQueue.enqueue(() => this.send('page', { ...this.context, ...page, pageViewId: page.id }));
    }
    finishPage(useBeacon) {
        if (!this.currentPage) {
            return;
        }
        this.updateScrollDepth();
        const page = this.currentPage;
        if (!page) {
            return;
        }
        this.queuePageRequest(page, 'page/leave', {
            ...this.context,
            activeSecondsDelta: this.accumulator.drainWholeSeconds(Date.now()),
            maxScrollPercent: page.maxScrollPercent,
            pageViewId: page.id,
        }, useBeacon, false);
        this.currentPage = undefined;
    }
    sendHeartbeat(force = false) {
        const page = this.currentPage;
        if (!page || (!force && document.visibilityState !== 'visible')) {
            return;
        }
        this.queuePageRequest(page, 'heartbeat', {
            ...this.context,
            activeSecondsDelta: this.accumulator.drainWholeSeconds(Date.now()),
            maxScrollPercent: page.maxScrollPercent,
            pageViewId: page.id,
        });
    }
    queuePageRequest(page, path, payload, useBeacon = false, requireCurrentPage = true) {
        const pageRegistered = this.pageRegistered;
        void this.requestQueue.enqueue(async () => {
            return ((await sendAfterPageRegistration(pageRegistered, async () => {
                if (requireCurrentPage && this.currentPage?.id !== page.id) {
                    return false;
                }
                return this.send(path, payload, useBeacon);
            })) ?? false);
        });
    }
    async send(path, payload, useBeacon = false) {
        try {
            const endpoint = this.endpoint(path);
            if (useBeacon && typeof navigator.sendBeacon === 'function') {
                return navigator.sendBeacon(endpoint, serializeBeaconPayload(payload));
            }
            const response = await fetch(endpoint, {
                body: JSON.stringify(payload),
                credentials: 'omit',
                headers: { 'content-type': 'text/plain;charset=UTF-8' },
                keepalive: useBeacon,
                method: 'POST',
                mode: 'cors',
            });
            return response.ok;
        }
        catch {
            // Tracking must never interrupt the host page.
            return false;
        }
    }
    installLifecycleListeners() {
        const activityEvents = ['keydown', 'pointerdown', 'scroll', 'touchstart'];
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
    patchHistory() {
        this.originalPushState = history.pushState;
        this.originalReplaceState = history.replaceState;
        const notify = () => this.handleNavigation();
        history.pushState = (...argumentsList) => {
            this.originalPushState?.apply(history, argumentsList);
            notify();
        };
        history.replaceState = (...argumentsList) => {
            this.originalReplaceState?.apply(history, argumentsList);
            notify();
        };
    }
    restoreHistory() {
        if (this.originalPushState) {
            history.pushState = this.originalPushState;
        }
        if (this.originalReplaceState) {
            history.replaceState = this.originalReplaceState;
        }
    }
    handleNavigation() {
        const currentUrl = this.currentPage?.url;
        if (!currentUrl || !hasNavigationChanged(currentUrl, window.location.href)) {
            return;
        }
        this.finishPage(false);
        this.startPage();
    }
    handleScroll() {
        if (this.scrollSampleTimer !== undefined) {
            return;
        }
        this.scrollSampleTimer = window.setTimeout(() => {
            this.scrollSampleTimer = undefined;
            this.updateScrollDepth();
        }, 250);
    }
    updateScrollDepth() {
        const page = this.currentPage;
        if (!page) {
            return;
        }
        const maxScrollPercent = Math.max(page.maxScrollPercent, this.readScrollPercent());
        this.currentPage = { ...page, maxScrollPercent };
        const threshold = [25, 50, 75, 100].find((candidate) => maxScrollPercent >= candidate && !this.observedScrollThresholds.has(candidate));
        if (threshold === undefined) {
            return;
        }
        this.observedScrollThresholds.add(threshold);
        this.queuePageRequest(page, 'event', {
            ...this.context,
            metadata: { percent: threshold },
            name: 'scroll_depth',
            pageViewId: page.id,
            type: 'scroll_depth',
        });
    }
    handleConfiguredClick(event) {
        const target = event.target;
        if (!(target instanceof Element)) {
            return;
        }
        const configuredElement = target.closest('[data-engage-event]');
        const eventName = configuredElement?.dataset.engageEvent?.trim();
        if (!eventName) {
            return;
        }
        const page = this.currentPage;
        if (!page) {
            return;
        }
        this.queuePageRequest(page, 'event', {
            ...this.context,
            metadata: {},
            name: eventName.slice(0, 128),
            pageViewId: page.id,
            type: 'cta_click',
        });
    }
    readScrollPercent() {
        const scrollingElement = document.scrollingElement ?? document.documentElement;
        const scrollableHeight = scrollingElement.scrollHeight - window.innerHeight;
        if (scrollableHeight <= 0) {
            return 100;
        }
        return Math.min(100, Math.max(0, Math.round((window.scrollY / scrollableHeight) * 100)));
    }
}
exports.EngagementManager = EngagementManager;

  };
  modules['./chat-widget'] = (require, exports) => {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ChatWidgetController = void 0;
exports.shouldOpenChatForNewAgentMessage = shouldOpenChatForNewAgentMessage;
exports.chatWidgetFrameStyles = chatWidgetFrameStyles;
function shouldOpenChatForNewAgentMessage(hasSyncedThread, latestAgentMessageId, nextAgentMessageId) {
    return Boolean(hasSyncedThread && nextAgentMessageId && nextAgentMessageId !== latestAgentMessageId);
}
function chatWidgetFrameStyles() {
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
function isChatThreadResponse(value) {
    if (!value || typeof value !== 'object')
        return false;
    const candidate = value;
    return Boolean(candidate.thread &&
        typeof candidate.thread.id === 'string' &&
        candidate.realtime &&
        typeof candidate.realtime.token === 'string' &&
        candidate.history &&
        Array.isArray(candidate.history.messages));
}
function isOutboundMessage(value) {
    if (!value || typeof value !== 'object')
        return false;
    const candidate = value;
    return typeof candidate.content === 'string' && typeof candidate.threadId === 'string';
}
function isMessage(value) {
    if (!value || typeof value !== 'object')
        return false;
    const candidate = value;
    return (typeof candidate.id === 'string' &&
        typeof candidate.threadId === 'string' &&
        typeof candidate.content === 'string' &&
        typeof candidate.sentAt === 'string' &&
        (candidate.senderType === 'AGENT' ||
            candidate.senderType === 'VISITOR' ||
            candidate.senderType === 'SYSTEM'));
}
class ChatWidgetController {
    context;
    bootstrapEndpoint;
    currentConfig;
    frame;
    launcher;
    launcherAnimationFrame;
    launcherStyle;
    hasSyncedThread = false;
    latestAgentMessageId;
    openRequested = false;
    syncTimer;
    constructor(context, bootstrapEndpoint) {
        this.context = context;
        this.bootstrapEndpoint = bootstrapEndpoint;
    }
    start() {
        try {
            this.mountLauncher();
            void this.syncThread();
            this.syncTimer = window.setInterval(() => void this.syncThread(), 3_000);
        }
        catch {
            // The widget is optional and must never interrupt the tracked website.
        }
    }
    stop() {
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
    mount() {
        if (this.frame)
            return;
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
    unmountFrame() {
        this.frame?.remove();
        this.frame = undefined;
    }
    mountLauncher() {
        if (this.launcher)
            return;
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
    startLauncherBlobAnimation(canvas) {
        const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
        const size = 68;
        canvas.height = size * pixelRatio;
        canvas.width = size * pixelRatio;
        const context = canvas.getContext('2d');
        if (!context)
            return;
        context.scale(pixelRatio, pixelRatio);
        const surface = context.createRadialGradient(24, 21, 2, 36, 38, 30);
        surface.addColorStop(0, '#3a3a3d');
        surface.addColorStop(0.52, '#252528');
        surface.addColorStop(1, '#111113');
        const drawEye = (x, y, radiusX, radiusY, gazeX, gazeY) => {
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
        const render = (timestamp) => {
            const elapsed = timestamp / 1_000;
            context.clearRect(0, 0, size, size);
            context.beginPath();
            const centerX = size / 2 + Math.sin(elapsed * 0.82) * 2.2;
            const centerY = size / 2 + Math.cos(elapsed * 0.67) * 1.8;
            for (let index = 0; index <= 64; index += 1) {
                const angle = (index / 64) * Math.PI * 2;
                const radius = 24 *
                    (1 +
                        Math.sin(angle * 3 + elapsed * 1.28) * 0.13 +
                        Math.sin(angle * 5 - elapsed * 0.92) * 0.08 +
                        Math.sin(angle * 2 + elapsed * 0.58) * 0.055);
                const x = centerX + Math.cos(angle) * radius;
                const y = centerY + Math.sin(angle) * radius;
                if (index === 0)
                    context.moveTo(x, y);
                else
                    context.lineTo(x, y);
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
    openChat() {
        this.openRequested = true;
        this.launcher?.removeAttribute('data-supernizo-unread');
        this.mount();
        this.postConfig();
        this.postOpenRequest();
    }
    receiveMessage = (event) => {
        if (event.origin !== new URL(this.bootstrapEndpoint).origin ||
            event.source !== this.frame?.contentWindow) {
            return;
        }
        if (!event.data || typeof event.data !== 'object')
            return;
        const data = event.data;
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
    async syncThread() {
        try {
            const endpoint = new URL('/api/chat/visitor/thread', this.bootstrapEndpoint);
            endpoint.searchParams.set('sitePublicKey', this.context.sitePublicKey);
            endpoint.searchParams.set('visitorId', this.context.visitorId);
            endpoint.searchParams.set('sessionId', this.context.sessionId);
            endpoint.searchParams.set('limit', '50');
            const response = await fetch(endpoint, { credentials: 'omit', mode: 'cors' });
            if (!response.ok)
                return;
            const body = await response.json();
            if (!body ||
                typeof body !== 'object' ||
                !('data' in body) ||
                !isChatThreadResponse(body.data))
                return;
            const agentMessage = [...body.data.history.messages]
                .reverse()
                .find((message) => message.senderType === 'AGENT');
            const isNewAgentMessage = shouldOpenChatForNewAgentMessage(this.hasSyncedThread, this.latestAgentMessageId, agentMessage?.id);
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
        }
        catch {
            // A temporary chat sync failure must not interrupt the tracked website.
        }
    }
    postConfig() {
        if (!this.currentConfig || !this.frame?.contentWindow)
            return;
        this.frame.contentWindow.postMessage({ config: this.currentConfig, type: 'supernizo-chat-config' }, new URL(this.bootstrapEndpoint).origin);
    }
    postOpenRequest() {
        if (!this.openRequested || !this.frame?.contentWindow)
            return;
        this.frame.contentWindow.postMessage({ type: 'supernizo-chat-open' }, new URL(this.bootstrapEndpoint).origin);
    }
    async sendMessage(message) {
        if (!this.currentConfig || message.threadId !== this.currentConfig.threadId)
            return;
        const content = message.content.trim().slice(0, 2_000);
        if (!content)
            return;
        const endpoint = new URL(`/api/chat/threads/${message.threadId}/messages`, this.bootstrapEndpoint);
        const response = await fetch(endpoint, {
            body: JSON.stringify({ content, context: this.context }),
            credentials: 'omit',
            headers: { 'content-type': 'text/plain;charset=UTF-8' },
            keepalive: true,
            method: 'POST',
            mode: 'cors',
        });
        if (!response.ok)
            return;
        const body = await response.json();
        if (!body || typeof body !== 'object' || !('data' in body) || !isMessage(body.data))
            return;
        this.frame?.contentWindow?.postMessage({ message: body.data, type: 'supernizo-chat-message' }, new URL(this.bootstrapEndpoint).origin);
    }
}
exports.ChatWidgetController = ChatWidgetController;

  };
  modules['./call-widget'] = (require, exports) => {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CallWidgetController = exports.CALL_WIDGET_PERMISSIONS_POLICY = void 0;
exports.isCallWidgetConfigRefreshDue = isCallWidgetConfigRefreshDue;
exports.callWidgetFrameStyles = callWidgetFrameStyles;
exports.readCallActionResponse = readCallActionResponse;
const CONFIG_REFRESH_AFTER_MS = 45 * 60 * 1_000;
const CONFIG_REFRESH_RETRY_MS = 60 * 1_000;
const CONFIG_REFRESH_TICK_MS = 60 * 1_000;
const MOTION_EASE_OUT = 'cubic-bezier(0.23, 1, 0.32, 1)';
const MOTION_EASE_HANDOFF = 'cubic-bezier(0.65, 0, 0.35, 1)';
const MOTION_HANDOFF_DURATION_MS = 680;
const CALL_FRAME_ENTER_KEYFRAMES = [
    {
        clipPath: 'inset(86% 0 0 78% round 36px)',
        offset: 0,
        opacity: 0.12,
        transform: 'translate3d(0, 5px, 0) scale(0.99)',
    },
    {
        clipPath: 'inset(86% 0 0 78% round 36px)',
        offset: 0.16,
        opacity: 1,
        transform: 'translate3d(0, 4px, 0) scale(0.99)',
    },
    {
        clipPath: 'inset(0 0 0 0 round 22px)',
        offset: 0.86,
        opacity: 1,
        transform: 'translate3d(0, 0, 0) scale(1)',
    },
    {
        clipPath: 'inset(0 0 0 0 round 18px)',
        offset: 1,
        opacity: 1,
        transform: 'translate3d(0, 0, 0) scale(1)',
    },
];
function isCallWidgetConfigRefreshDue(lastRefreshAt, lastAttemptAt, now = Date.now()) {
    return (now - lastRefreshAt >= CONFIG_REFRESH_AFTER_MS && now - lastAttemptAt >= CONFIG_REFRESH_RETRY_MS);
}
// The call interface runs in a cross-origin iframe. The host page must
// explicitly delegate these features before that interface can request them.
exports.CALL_WIDGET_PERMISSIONS_POLICY = 'microphone; camera';
function callWidgetFrameStyles(visible) {
    return [
        'background:transparent',
        'border:0',
        'border-radius:18px',
        'bottom:16px',
        `height:${visible ? '500px' : '1px'}`,
        `max-width:${visible ? 'calc(100vw - 32px)' : '1px'}`,
        'overflow:hidden',
        `opacity:${visible ? '1' : '0'}`,
        `pointer-events:${visible ? 'auto' : 'none'}`,
        'position:fixed',
        'right:16px',
        'transform-origin:bottom right',
        `width:${visible ? '330px' : '1px'}`,
        'z-index:2147483001',
    ];
}
function isCall(value) {
    if (!value || typeof value !== 'object')
        return false;
    const candidate = value;
    return (typeof candidate.id === 'string' &&
        typeof candidate.siteId === 'string' &&
        typeof candidate.visitorId === 'string' &&
        (candidate.type === 'AUDIO' || candidate.type === 'VIDEO') &&
        typeof candidate.status === 'string');
}
function isLiveKitMedia(value) {
    if (!value || typeof value !== 'object')
        return false;
    const candidate = value;
    return typeof candidate.token === 'string' && typeof candidate.url === 'string';
}
function readCallActionResponse(value) {
    if (!value || typeof value !== 'object')
        return undefined;
    const candidate = value;
    if (!isCall(candidate.data))
        return undefined;
    return {
        call: candidate.data,
        ...(isLiveKitMedia(candidate.media) ? { media: candidate.media } : {}),
    };
}
class CallWidgetController {
    context;
    endpoint;
    config;
    renewConfig;
    frame;
    frameAnimation;
    frameVisible = false;
    configRefreshTimer;
    configRefreshInFlight = false;
    lastConfigRefreshAt = Date.now();
    lastConfigRefreshAttemptAt = 0;
    launcherAnimation;
    syncTimer;
    constructor(context, endpoint, config, renewConfig) {
        this.context = context;
        this.endpoint = endpoint;
        this.config = config;
        this.renewConfig = renewConfig;
    }
    start() {
        try {
            if (this.frame)
                return;
            const widgetUrl = new URL('/widget/call', this.endpoint);
            widgetUrl.searchParams.set('host_origin', window.location.origin);
            const frame = document.createElement('iframe');
            frame.setAttribute('aria-label', 'Incoming calls');
            frame.setAttribute('title', 'Incoming calls');
            frame.allow = exports.CALL_WIDGET_PERMISSIONS_POLICY;
            frame.src = widgetUrl.toString();
            frame.style.cssText = callWidgetFrameStyles(false).join(';');
            frame.addEventListener('load', () => this.postConfig());
            window.addEventListener('message', this.receiveMessage);
            (document.body ?? document.documentElement).append(frame);
            this.frame = frame;
            this.syncTimer = window.setInterval(() => this.postConfig(), 3_000);
            this.configRefreshTimer = window.setInterval(() => void this.refreshConfigIfDue(), CONFIG_REFRESH_TICK_MS);
            document.addEventListener('visibilitychange', this.refreshConfigWhenVisible);
        }
        catch {
            // The optional call UI must not interrupt the tracked website.
        }
    }
    stop() {
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
    receiveMessage = (event) => {
        if (event.origin !== new URL(this.endpoint).origin ||
            event.source !== this.frame?.contentWindow ||
            !event.data ||
            typeof event.data !== 'object') {
            return;
        }
        const data = event.data;
        if (data.type === 'supernizo-call-visibility' && typeof data.visible === 'boolean') {
            this.setFrameVisibility(data.visible);
            return;
        }
        if (data.type === 'supernizo-call-ready') {
            this.postConfig();
            return;
        }
        if (data.type === 'supernizo-call-action' &&
            (data.action === 'accept' || data.action === 'reject') &&
            isCall(data.call)) {
            void this.respond(data.call, data.action);
        }
        if (data.type === 'supernizo-call-end' && isCall(data.call)) {
            void this.respond(data.call, 'end');
        }
        if (data.type === 'supernizo-call-media-failure' &&
            isCall(data.call) &&
            (data.failureCode === 'MEDIA_CAMERA_PERMISSION_DENIED' ||
                data.failureCode === 'MEDIA_DEVICE_UNAVAILABLE' ||
                data.failureCode === 'MEDIA_MICROPHONE_PERMISSION_DENIED')) {
            void this.reportMediaFailure(data.call, data.failureCode);
        }
    };
    refreshConfigWhenVisible = () => {
        if (document.visibilityState === 'visible')
            void this.refreshConfigIfDue();
    };
    async refreshConfigIfDue() {
        const now = Date.now();
        if (!this.renewConfig ||
            this.configRefreshInFlight ||
            !isCallWidgetConfigRefreshDue(this.lastConfigRefreshAt, this.lastConfigRefreshAttemptAt, now)) {
            return;
        }
        this.configRefreshInFlight = true;
        this.lastConfigRefreshAttemptAt = now;
        try {
            const refreshed = await this.renewConfig();
            if (!refreshed)
                return;
            this.config = refreshed;
            this.lastConfigRefreshAt = Date.now();
            this.postConfig();
        }
        catch {
            // Credential renewal retries after a short backoff without affecting the host page.
        }
        finally {
            this.configRefreshInFlight = false;
        }
    }
    postConfig() {
        this.frame?.contentWindow?.postMessage({ config: this.config, type: 'supernizo-call-config' }, new URL(this.endpoint).origin);
    }
    setFrameVisibility(visible) {
        if (!this.frame || visible === this.frameVisible)
            return;
        this.frameVisible = visible;
        this.frameAnimation?.cancel();
        this.frameAnimation = undefined;
        this.frame.style.cssText = callWidgetFrameStyles(visible).join(';');
        const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        if (visible && typeof this.frame.animate === 'function') {
            this.frameAnimation = this.frame.animate(reducedMotion ? [{ opacity: 0 }, { opacity: 1 }] : CALL_FRAME_ENTER_KEYFRAMES, {
                duration: reducedMotion ? 140 : MOTION_HANDOFF_DURATION_MS,
                easing: reducedMotion ? MOTION_EASE_OUT : MOTION_EASE_HANDOFF,
                fill: 'both',
            });
        }
        this.setLauncherVisible(!visible, reducedMotion);
    }
    findLauncher() {
        return document.querySelector('[data-supernizo-launcher="true"]');
    }
    setLauncherVisible(visible, reducedMotion) {
        const launcher = this.findLauncher();
        if (!launcher)
            return;
        this.launcherAnimation?.cancel();
        this.launcherAnimation = undefined;
        launcher.style.pointerEvents = visible ? '' : 'none';
        if (typeof launcher.animate !== 'function') {
            launcher.style.opacity = visible ? '1' : '0';
            return;
        }
        if (!visible && !reducedMotion && this.frame) {
            const launcherRect = launcher.getBoundingClientRect();
            const frameRect = this.frame.getBoundingClientRect();
            const targetX = frameRect.left + frameRect.width / 2;
            const targetY = frameRect.top + frameRect.height * 0.31;
            const translateX = targetX - (launcherRect.left + launcherRect.width / 2);
            const translateY = targetY - (launcherRect.top + launcherRect.height / 2);
            launcher.style.zIndex = '2147483002';
            const animation = launcher.animate([
                {
                    offset: 0,
                    opacity: 1,
                    transform: 'translate3d(0, 0, 0) scale(1)',
                },
                {
                    offset: 0.18,
                    opacity: 1,
                    transform: `translate3d(${translateX * 0.1}px, ${translateY * 0.1}px, 0) scale(1.04)`,
                },
                {
                    offset: 0.76,
                    opacity: 1,
                    transform: `translate3d(${translateX * 0.9}px, ${translateY * 0.9}px, 0) scale(1.38)`,
                },
                {
                    offset: 0.9,
                    opacity: 1,
                    transform: `translate3d(${translateX}px, ${translateY}px, 0) scale(1.48)`,
                },
                {
                    offset: 1,
                    opacity: 0,
                    transform: `translate3d(${translateX}px, ${translateY}px, 0) scale(1.5)`,
                },
            ], {
                duration: MOTION_HANDOFF_DURATION_MS,
                easing: MOTION_EASE_HANDOFF,
                fill: 'both',
            });
            this.launcherAnimation = animation;
            animation.addEventListener('finish', () => {
                if (this.launcherAnimation === animation)
                    launcher.style.zIndex = '2147482999';
            }, { once: true });
            return;
        }
        launcher.style.zIndex = '2147482999';
        const hiddenFrame = reducedMotion
            ? { opacity: 0 }
            : { opacity: 0, transform: 'translate3d(0, 5px, 0) scale(0.84)' };
        const visibleFrame = reducedMotion
            ? { opacity: 1 }
            : { opacity: 1, transform: 'translate3d(0, 0, 0) scale(1)' };
        this.launcherAnimation = launcher.animate(visible ? [hiddenFrame, visibleFrame] : [visibleFrame, hiddenFrame], {
            duration: reducedMotion ? 120 : visible ? 220 : 150,
            easing: MOTION_EASE_OUT,
            fill: 'both',
        });
    }
    async respond(call, action) {
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
            const body = await response.json();
            const actionResponse = readCallActionResponse(body);
            if (!actionResponse) {
                this.postActionError(call, action);
                return;
            }
            this.frame?.contentWindow?.postMessage({ call: actionResponse.call, type: 'supernizo-call-status' }, new URL(this.endpoint).origin);
            if (action === 'accept' && actionResponse.media) {
                this.postMedia(actionResponse.call.id, actionResponse.media);
                return;
            }
            if (action === 'accept')
                await this.requestMedia(actionResponse.call);
        }
        catch {
            this.postActionError(call, action);
            // The host page remains unaffected when the calling API is unavailable.
        }
    }
    async reportMediaFailure(call, failureCode) {
        try {
            const response = await fetch(new URL(`/api/calls/${call.id}/fail`, this.endpoint), {
                body: JSON.stringify({ context: this.context, failureCode }),
                credentials: 'omit',
                headers: { 'content-type': 'text/plain;charset=UTF-8' },
                keepalive: true,
                method: 'POST',
                mode: 'cors',
            });
            if (!response.ok)
                return;
            const body = await response.json();
            const actionResponse = readCallActionResponse(body);
            if (!actionResponse)
                return;
            this.frame?.contentWindow?.postMessage({ call: actionResponse.call, type: 'supernizo-call-status' }, new URL(this.endpoint).origin);
        }
        catch {
            // Media failure reporting is best-effort and must not affect the host page.
        }
    }
    postActionError(call, action) {
        this.frame?.contentWindow?.postMessage({ action, callId: call.id, type: 'supernizo-call-action-error' }, new URL(this.endpoint).origin);
    }
    async requestMedia(call) {
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
            if (!response.ok)
                return;
            const body = await response.json();
            if (!body || typeof body !== 'object' || !('data' in body) || !isLiveKitMedia(body.data))
                return;
            this.postMedia(call.id, body.data);
        }
        catch {
            // A token failure must not affect the tracked website.
        }
    }
    postMedia(callId, media) {
        this.frame?.contentWindow?.postMessage({ callId, media, type: 'supernizo-call-media' }, new URL(this.endpoint).origin);
    }
}
exports.CallWidgetController = CallWidgetController;

  };
  modules['./index'] = (require, exports) => {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Tracker = void 0;
exports.resolveTrackerIdentifiers = resolveTrackerIdentifiers;
exports.createTracker = createTracker;
const engagement_1 = require("./engagement");
const chat_widget_1 = require("./chat-widget");
const call_widget_1 = require("./call-widget");
const STORAGE_PREFIX = 'supernizo_';
const DISABLED_KEY = `${STORAGE_PREFIX}tracking_disabled`;
let engagementManager;
let chatWidget;
let callWidget;
function visitorStorageKey(sitePublicKey) {
    return `${STORAGE_PREFIX}visitor_id:${sitePublicKey}`;
}
function sessionStorageKey(sitePublicKey) {
    return `${STORAGE_PREFIX}session_id:${sitePublicKey}`;
}
function browserIdentifierStorage() {
    if (typeof window === 'undefined') {
        return undefined;
    }
    return {
        getSession: (key) => {
            try {
                return window.sessionStorage.getItem(key);
            }
            catch {
                return null;
            }
        },
        getVisitor: (key) => {
            try {
                const localValue = window.localStorage.getItem(key);
                if (localValue) {
                    return localValue;
                }
                const cookiePrefix = `${encodeURIComponent(key)}=`;
                const cookieValue = document.cookie
                    .split('; ')
                    .find((entry) => entry.startsWith(cookiePrefix));
                return cookieValue ? decodeURIComponent(cookieValue.slice(cookiePrefix.length)) : null;
            }
            catch {
                return null;
            }
        },
        setSession: (key, value) => {
            try {
                window.sessionStorage.setItem(key, value);
            }
            catch {
                // Storage restrictions must not affect the host page.
            }
        },
        setVisitor: (key, value) => {
            try {
                const secureAttribute = window.location.protocol === 'https:' ? '; Secure' : '';
                document.cookie = `${encodeURIComponent(key)}=${encodeURIComponent(value)}; Max-Age=31536000; Path=/; SameSite=Lax${secureAttribute}`;
                window.localStorage.setItem(key, value);
            }
            catch {
                // A browser may block both cookies and storage. The SDK will simply no-op.
            }
        },
    };
}
function createRandomUuid() {
    if (typeof crypto === 'undefined') {
        return undefined;
    }
    if (typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
    }
    if (typeof crypto.getRandomValues !== 'function') {
        return undefined;
    }
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40;
    bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
    const hexadecimal = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
    return `${hexadecimal.slice(0, 8)}-${hexadecimal.slice(8, 12)}-${hexadecimal.slice(12, 16)}-${hexadecimal.slice(16, 20)}-${hexadecimal.slice(20)}`;
}
function resolveTrackerIdentifiers(storage, sitePublicKey, createIdentifier = createRandomUuid) {
    const storedVisitorId = storage.getVisitor(visitorStorageKey(sitePublicKey));
    const storedSessionId = storage.getSession(sessionStorageKey(sitePublicKey));
    const visitorId = storedVisitorId ?? createIdentifier();
    const sessionId = storedSessionId ?? createIdentifier();
    if (!visitorId || !sessionId) {
        return undefined;
    }
    if (!storedVisitorId) {
        storage.setVisitor(visitorStorageKey(sitePublicKey), visitorId);
    }
    if (!storedSessionId) {
        storage.setSession(sessionStorageKey(sitePublicKey), sessionId);
    }
    return { visitorId, sessionId };
}
function findScriptElement() {
    if (typeof document === 'undefined') {
        return undefined;
    }
    const current = document.currentScript;
    if (current instanceof HTMLScriptElement && current.dataset.siteKey) {
        return current;
    }
    return Array.from(document.scripts).find((script) => script.dataset.siteKey);
}
function resolveEndpoint(script, configuredEndpoint) {
    if (configuredEndpoint) {
        return configuredEndpoint;
    }
    if (script.dataset.endpoint) {
        return script.dataset.endpoint;
    }
    try {
        return new URL('/api/track/bootstrap', script.src).toString();
    }
    catch {
        return '/api/track/bootstrap';
    }
}
function getBrowserMetadata() {
    if (typeof window === 'undefined' ||
        typeof document === 'undefined' ||
        typeof navigator === 'undefined') {
        return undefined;
    }
    const userAgentData = navigator.userAgentData;
    const clientHints = userAgentData
        ? {
            brands: userAgentData.brands.map((brand) => ({
                brand: brand.brand,
                version: brand.version,
            })),
            mobile: userAgentData.mobile,
            platform: userAgentData.platform,
        }
        : undefined;
    return {
        clientHints,
        language: navigator.language || 'und',
        referrer: document.referrer || null,
        screenHeight: window.screen?.height ?? 0,
        screenWidth: window.screen?.width ?? 0,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone ?? null,
        title: document.title,
        url: window.location.href,
        userAgent: navigator.userAgent,
    };
}
function isBootstrapResponse(value) {
    if (!value || typeof value !== 'object') {
        return false;
    }
    const response = value;
    return (typeof response.visitorId === 'string' &&
        typeof response.sessionId === 'string' &&
        typeof response.heartbeatIntervalSeconds === 'number' &&
        Boolean(response.features) &&
        Boolean(response.realtime));
}
async function requestTrackerBootstrap(endpoint, payload) {
    try {
        const response = await fetch(endpoint, {
            body: JSON.stringify(payload),
            credentials: 'omit',
            headers: { 'content-type': 'text/plain;charset=UTF-8' },
            keepalive: true,
            method: 'POST',
            mode: 'cors',
        });
        if (!response.ok)
            return undefined;
        const responseBody = await response.json();
        return isBootstrapResponse(responseBody) ? responseBody : undefined;
    }
    catch {
        return undefined;
    }
}
function readDisabledState() {
    if (typeof window === 'undefined') {
        return true;
    }
    try {
        return window.localStorage.getItem(DISABLED_KEY) === 'true';
    }
    catch {
        return false;
    }
}
function writeDisabledState(disabled) {
    if (typeof window === 'undefined') {
        return;
    }
    try {
        if (disabled) {
            window.localStorage.setItem(DISABLED_KEY, 'true');
        }
        else {
            window.localStorage.removeItem(DISABLED_KEY);
        }
    }
    catch {
        // Tracking controls must not break the host page when storage is blocked.
    }
}
exports.Tracker = {
    disable: () => {
        writeDisabledState(true);
        engagementManager?.stop();
        engagementManager = undefined;
        chatWidget?.stop();
        chatWidget = undefined;
        callWidget?.stop();
        callWidget = undefined;
    },
    enable: () => writeDisabledState(false),
    init: async (options = {}) => {
        try {
            if (typeof window === 'undefined' || options.disabled || readDisabledState()) {
                return undefined;
            }
            const script = findScriptElement();
            const sitePublicKey = options.sitePublicKey ?? script?.dataset.siteKey;
            if (!script || !sitePublicKey || (options.consentRequired && !options.consentGranted)) {
                return undefined;
            }
            if (script.dataset.disabled === 'true' ||
                (script.dataset.consentRequired === 'true' && script.dataset.consentGranted !== 'true')) {
                return undefined;
            }
            const storage = browserIdentifierStorage();
            const browser = getBrowserMetadata();
            if (!storage || !browser || typeof fetch !== 'function') {
                return undefined;
            }
            const identifiers = resolveTrackerIdentifiers(storage, sitePublicKey);
            if (!identifiers) {
                return undefined;
            }
            const bootstrapEndpoint = resolveEndpoint(script, options.endpoint);
            const responseBody = await requestTrackerBootstrap(bootstrapEndpoint, {
                ...identifiers,
                browser,
                sitePublicKey,
            });
            if (!responseBody) {
                return undefined;
            }
            const renewCallWidgetConfig = async () => {
                const refreshedBrowser = getBrowserMetadata();
                if (!refreshedBrowser)
                    return undefined;
                const refreshed = await requestTrackerBootstrap(bootstrapEndpoint, {
                    ...identifiers,
                    browser: refreshedBrowser,
                    sitePublicKey,
                });
                return refreshed
                    ? {
                        channel: refreshed.realtime.channel,
                        ...(refreshed.calling ? { livekitUrl: refreshed.calling.url } : {}),
                        token: refreshed.realtime.authorizationToken,
                    }
                    : undefined;
            };
            engagementManager?.stop();
            engagementManager = new engagement_1.EngagementManager({
                sessionId: responseBody.sessionId,
                sitePublicKey,
                visitorId: responseBody.visitorId,
            }, bootstrapEndpoint, createRandomUuid);
            engagementManager.start();
            chatWidget?.stop();
            chatWidget = responseBody.features.chatEnabled
                ? new chat_widget_1.ChatWidgetController({
                    sessionId: responseBody.sessionId,
                    sitePublicKey,
                    visitorId: responseBody.visitorId,
                }, bootstrapEndpoint)
                : undefined;
            chatWidget?.start();
            callWidget?.stop();
            callWidget =
                responseBody.features.audioCallEnabled || responseBody.features.videoCallEnabled
                    ? new call_widget_1.CallWidgetController({
                        sessionId: responseBody.sessionId,
                        sitePublicKey,
                        visitorId: responseBody.visitorId,
                    }, bootstrapEndpoint, {
                        channel: responseBody.realtime.channel,
                        ...(responseBody.calling ? { livekitUrl: responseBody.calling.url } : {}),
                        token: responseBody.realtime.authorizationToken,
                    }, renewCallWidgetConfig)
                    : undefined;
            callWidget?.start();
            return responseBody;
        }
        catch {
            return undefined;
        }
    },
    track: (name, metadata) => engagementManager?.track(name, metadata),
};
function toRequestBody(event, sitePublicKey) {
    return JSON.stringify({ sitePublicKey, event });
}
function validateTrackerOptions(options) {
    if (!options.sitePublicKey.trim()) {
        throw new TypeError('A site public key is required.');
    }
    try {
        new URL(options.endpoint);
    }
    catch {
        throw new TypeError('A valid tracker endpoint is required.');
    }
    return options;
}
function createTracker(options) {
    const validatedOptions = validateTrackerOptions(options);
    return {
        track(event) {
            const body = toRequestBody(event, validatedOptions.sitePublicKey);
            if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
                navigator.sendBeacon(validatedOptions.endpoint, body);
                return;
            }
            void fetch(validatedOptions.endpoint, {
                body,
                headers: { 'content-type': 'application/json' },
                keepalive: true,
                method: 'POST',
            }).catch(() => undefined);
        },
    };
}
if (typeof window !== 'undefined') {
    window.SupernizoTracker = exports.Tracker;
    void exports.Tracker.init();
}

  };
  require('./index');
})();
