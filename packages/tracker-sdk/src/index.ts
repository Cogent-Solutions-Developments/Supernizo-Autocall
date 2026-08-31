import type { VisitorEvent } from '@supernizo/shared';

export type TrackerOptions = Readonly<{
  endpoint: string;
  sitePublicKey: string;
}>;

export type TrackerClient = Readonly<{
  track: (event: VisitorEvent) => void;
}>;

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
