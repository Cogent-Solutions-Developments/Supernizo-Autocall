import type {
  TrackerBootstrapRequest,
  TrackerBootstrapResponse,
  VisitorEvent,
} from '@supernizo/shared';

import { EngagementManager } from './engagement';
import { ChatWidgetController } from './chat-widget';
import { CallWidgetController } from './call-widget';
import { resolveBootstrapEndpoint } from './platform-url';

export type TrackerOptions = Readonly<{
  endpoint: string;
  sitePublicKey: string;
}>;

export type TrackerClient = Readonly<{
  track: (event: VisitorEvent) => void;
}>;

export type TrackerIdentifiers = Readonly<{
  sessionId: string;
  visitorId: string;
}>;

export type TrackerIdentifierStorage = Readonly<{
  getSession: (key: string) => string | null;
  getVisitor: (key: string) => string | null;
  setSession: (key: string, value: string) => void;
  setVisitor: (key: string, value: string) => void;
}>;

export type TrackerInitOptions = Readonly<{
  consentGranted?: boolean;
  consentRequired?: boolean;
  disabled?: boolean;
  endpoint?: string;
  sitePublicKey?: string;
}>;

export type TrackerRuntime = Readonly<{
  disable: () => void;
  enable: () => void;
  init: (options?: TrackerInitOptions) => Promise<TrackerBootstrapResponse | undefined>;
  track: (name: string, metadata?: unknown) => void;
}>;

type UserAgentData = Readonly<{
  brands: readonly Readonly<{ brand: string; version: string }>[];
  mobile: boolean;
  platform: string;
}>;

type NavigatorWithUserAgentData = Navigator &
  Readonly<{
    userAgentData?: UserAgentData;
  }>;

const STORAGE_PREFIX = 'supernizo_';
const DISABLED_KEY = `${STORAGE_PREFIX}tracking_disabled`;
let engagementManager: EngagementManager | undefined;
let chatWidget: ChatWidgetController | undefined;
let callWidget: CallWidgetController | undefined;

function visitorStorageKey(sitePublicKey: string): string {
  return `${STORAGE_PREFIX}visitor_id:${sitePublicKey}`;
}

function sessionStorageKey(sitePublicKey: string): string {
  return `${STORAGE_PREFIX}session_id:${sitePublicKey}`;
}

function browserIdentifierStorage(): TrackerIdentifierStorage | undefined {
  if (typeof window === 'undefined') {
    return undefined;
  }

  return {
    getSession: (key) => {
      try {
        return window.sessionStorage.getItem(key);
      } catch {
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
      } catch {
        return null;
      }
    },
    setSession: (key, value) => {
      try {
        window.sessionStorage.setItem(key, value);
      } catch {
        // Storage restrictions must not affect the host page.
      }
    },
    setVisitor: (key, value) => {
      try {
        const secureAttribute = window.location.protocol === 'https:' ? '; Secure' : '';
        document.cookie = `${encodeURIComponent(key)}=${encodeURIComponent(value)}; Max-Age=31536000; Path=/; SameSite=Lax${secureAttribute}`;
        window.localStorage.setItem(key, value);
      } catch {
        // A browser may block both cookies and storage. The SDK will simply no-op.
      }
    },
  };
}

function createRandomUuid(): string | undefined {
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

export function resolveTrackerIdentifiers(
  storage: TrackerIdentifierStorage,
  sitePublicKey: string,
  createIdentifier: () => string | undefined = createRandomUuid,
): TrackerIdentifiers | undefined {
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

function findScriptElement(): HTMLScriptElement | undefined {
  if (typeof document === 'undefined') {
    return undefined;
  }

  const current = document.currentScript;
  if (current instanceof HTMLScriptElement && current.dataset.siteKey) {
    return current;
  }

  return Array.from(document.scripts).find((script) => script.dataset.siteKey);
}

function resolveEndpoint(script: HTMLScriptElement, configuredEndpoint?: string): string {
  if (configuredEndpoint) {
    return configuredEndpoint;
  }

  if (script.dataset.endpoint) {
    return script.dataset.endpoint;
  }

  try {
    return resolveBootstrapEndpoint(script.src);
  } catch {
    return '/api/track/bootstrap';
  }
}

function getBrowserMetadata(): TrackerBootstrapRequest['browser'] | undefined {
  if (
    typeof window === 'undefined' ||
    typeof document === 'undefined' ||
    typeof navigator === 'undefined'
  ) {
    return undefined;
  }

  const userAgentData = (navigator as NavigatorWithUserAgentData).userAgentData;
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

function isBootstrapResponse(value: unknown): value is TrackerBootstrapResponse {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const response = value as Partial<TrackerBootstrapResponse>;
  return (
    typeof response.visitorId === 'string' &&
    typeof response.sessionId === 'string' &&
    typeof response.heartbeatIntervalSeconds === 'number' &&
    Boolean(response.features) &&
    Boolean(response.realtime)
  );
}

async function requestTrackerBootstrap(
  endpoint: string,
  payload: TrackerBootstrapRequest,
): Promise<TrackerBootstrapResponse | undefined> {
  try {
    const response = await fetch(endpoint, {
      body: JSON.stringify(payload),
      credentials: 'omit',
      headers: { 'content-type': 'text/plain;charset=UTF-8' },
      keepalive: true,
      method: 'POST',
      mode: 'cors',
    });
    if (!response.ok) return undefined;
    const responseBody: unknown = await response.json();
    return isBootstrapResponse(responseBody) ? responseBody : undefined;
  } catch {
    return undefined;
  }
}

function readDisabledState(): boolean {
  if (typeof window === 'undefined') {
    return true;
  }

  try {
    return window.localStorage.getItem(DISABLED_KEY) === 'true';
  } catch {
    return false;
  }
}

function writeDisabledState(disabled: boolean): void {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    if (disabled) {
      window.localStorage.setItem(DISABLED_KEY, 'true');
    } else {
      window.localStorage.removeItem(DISABLED_KEY);
    }
  } catch {
    // Tracking controls must not break the host page when storage is blocked.
  }
}

export const Tracker: TrackerRuntime = {
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

      if (
        script.dataset.disabled === 'true' ||
        (script.dataset.consentRequired === 'true' && script.dataset.consentGranted !== 'true')
      ) {
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
        if (!refreshedBrowser) return undefined;
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
      engagementManager = new EngagementManager(
        {
          sessionId: responseBody.sessionId,
          sitePublicKey,
          visitorId: responseBody.visitorId,
        },
        bootstrapEndpoint,
        createRandomUuid,
      );
      engagementManager.start();
      chatWidget?.stop();
      chatWidget = responseBody.features.chatEnabled
        ? new ChatWidgetController(
            {
              sessionId: responseBody.sessionId,
              sitePublicKey,
              visitorId: responseBody.visitorId,
            },
            bootstrapEndpoint,
          )
        : undefined;
      chatWidget?.start();
      callWidget?.stop();
      callWidget =
        responseBody.features.audioCallEnabled || responseBody.features.videoCallEnabled
          ? new CallWidgetController(
              {
                sessionId: responseBody.sessionId,
                sitePublicKey,
                visitorId: responseBody.visitorId,
              },
              bootstrapEndpoint,
              {
                channel: responseBody.realtime.channel,
                ...(responseBody.calling ? { livekitUrl: responseBody.calling.url } : {}),
                token: responseBody.realtime.authorizationToken,
              },
              renewCallWidgetConfig,
            )
          : undefined;
      callWidget?.start();
      return responseBody;
    } catch {
      return undefined;
    }
  },
  track: (name, metadata) => engagementManager?.track(name, metadata),
};

function toRequestBody(event: VisitorEvent, sitePublicKey: string): string {
  return JSON.stringify({ sitePublicKey, event });
}

function validateTrackerOptions(options: TrackerOptions): TrackerOptions {
  if (!options.sitePublicKey.trim()) {
    throw new TypeError('A site public key is required.');
  }

  try {
    new URL(options.endpoint);
  } catch {
    throw new TypeError('A valid tracker endpoint is required.');
  }

  return options;
}

export function createTracker(options: TrackerOptions): TrackerClient {
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

declare global {
  interface Window {
    SupernizoTracker?: TrackerRuntime;
  }
}

if (typeof window !== 'undefined') {
  window.SupernizoTracker = Tracker;
  void Tracker.init();
}
