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
const platform_url_1 = require("./platform-url");
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
        return (0, platform_url_1.resolveApplicationEndpoint)(this.bootstrapEndpoint, `/api/track/${path}`);
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
const platform_url_1 = require("./platform-url");
function shouldOpenChatForNewAgentMessage(hasSyncedThread, latestAgentMessageId, nextAgentMessageId) {
    return Boolean(hasSyncedThread && nextAgentMessageId && nextAgentMessageId !== latestAgentMessageId);
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
        const widgetUrl = new URL((0, platform_url_1.resolveApplicationEndpoint)(this.bootstrapEndpoint, '/widget/chat'));
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
    unmountFrame() {
        this.frame?.remove();
        this.frame = undefined;
    }
    mountLauncher() {
        if (this.launcher)
            return;
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
            const endpoint = new URL((0, platform_url_1.resolveApplicationEndpoint)(this.bootstrapEndpoint, '/api/chat/visitor/thread'));
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
        const endpoint = new URL((0, platform_url_1.resolveApplicationEndpoint)(this.bootstrapEndpoint, `/api/chat/threads/${message.threadId}/messages`));
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
exports.callWidgetFrameStyles = callWidgetFrameStyles;
const platform_url_1 = require("./platform-url");
// The call interface runs in a cross-origin iframe. The host page must
// explicitly delegate these features before that interface can request them.
exports.CALL_WIDGET_PERMISSIONS_POLICY = 'microphone; camera';
function callWidgetFrameStyles(visible) {
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
class CallWidgetController {
    context;
    endpoint;
    config;
    frame;
    syncTimer;
    constructor(context, endpoint, config) {
        this.context = context;
        this.endpoint = endpoint;
        this.config = config;
    }
    start() {
        try {
            if (this.frame)
                return;
            const widgetUrl = new URL((0, platform_url_1.resolveApplicationEndpoint)(this.endpoint, '/widget/call'));
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
        window.removeEventListener('message', this.receiveMessage);
        this.frame?.remove();
        this.frame = undefined;
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
    };
    postConfig() {
        this.frame?.contentWindow?.postMessage({ config: this.config, type: 'supernizo-call-config' }, new URL(this.endpoint).origin);
    }
    setFrameVisibility(visible) {
        if (!this.frame)
            return;
        this.frame.style.cssText = callWidgetFrameStyles(visible).join(';');
    }
    async respond(call, action) {
        try {
            const response = await fetch(new URL((0, platform_url_1.resolveApplicationEndpoint)(this.endpoint, `/api/calls/${call.id}/${action}`)), {
                body: JSON.stringify({ context: this.context }),
                credentials: 'omit',
                headers: { 'content-type': 'text/plain;charset=UTF-8' },
                keepalive: true,
                method: 'POST',
                mode: 'cors',
            });
            if (!response.ok)
                return;
            const body = await response.json();
            if (!body || typeof body !== 'object' || !('data' in body) || !isCall(body.data))
                return;
            this.frame?.contentWindow?.postMessage({ call: body.data, type: 'supernizo-call-status' }, new URL(this.endpoint).origin);
            if (action === 'accept')
                await this.requestMedia(body.data);
        }
        catch {
            // The host page remains unaffected when the calling API is unavailable.
        }
    }
    async requestMedia(call) {
        try {
            const response = await fetch(new URL((0, platform_url_1.resolveApplicationEndpoint)(this.endpoint, '/api/livekit/token')), {
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
            this.frame?.contentWindow?.postMessage({ media: body.data, type: 'supernizo-call-media' }, new URL(this.endpoint).origin);
        }
        catch {
            // A token failure must not affect the tracked website.
        }
    }
}
exports.CallWidgetController = CallWidgetController;

  };
  modules['./platform-url'] = (require, exports) => {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveBootstrapEndpoint = resolveBootstrapEndpoint;
exports.resolveApplicationEndpoint = resolveApplicationEndpoint;
const TRACKER_BOOTSTRAP_PATH = '/api/track/bootstrap';
function parseUrl(value) {
    const fallbackBase = typeof location === 'undefined' ? 'http://localhost' : location.href;
    return new URL(value, fallbackBase);
}
function resolveBootstrapEndpoint(scriptSource) {
    const scriptUrl = parseUrl(scriptSource);
    const sdkMarkerIndex = scriptUrl.pathname.lastIndexOf('/sdk/');
    const basePath = sdkMarkerIndex >= 0 ? scriptUrl.pathname.slice(0, sdkMarkerIndex) : '';
    scriptUrl.pathname = `${basePath}${TRACKER_BOOTSTRAP_PATH}`;
    scriptUrl.search = '';
    scriptUrl.hash = '';
    return scriptUrl.toString();
}
function resolveApplicationEndpoint(reference, path) {
    if (!path.startsWith('/')) {
        throw new Error('Platform API paths must start with a slash.');
    }
    const referenceUrl = parseUrl(reference);
    const bootstrapIndex = referenceUrl.pathname.lastIndexOf(TRACKER_BOOTSTRAP_PATH);
    const basePath = bootstrapIndex >= 0 ? referenceUrl.pathname.slice(0, bootstrapIndex) : '';
    return new URL(`${basePath}${path}`, referenceUrl.origin).toString();
}

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
const platform_url_1 = require("./platform-url");
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
        return (0, platform_url_1.resolveBootstrapEndpoint)(script.src);
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
            const response = await fetch(bootstrapEndpoint, {
                body: JSON.stringify({
                    ...identifiers,
                    browser,
                    sitePublicKey,
                }),
                credentials: 'omit',
                headers: { 'content-type': 'text/plain;charset=UTF-8' },
                keepalive: true,
                method: 'POST',
                mode: 'cors',
            });
            if (!response.ok) {
                return undefined;
            }
            const responseBody = await response.json();
            if (!isBootstrapResponse(responseBody)) {
                return undefined;
            }
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
                        token: responseBody.realtime.authorizationToken,
                    })
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
