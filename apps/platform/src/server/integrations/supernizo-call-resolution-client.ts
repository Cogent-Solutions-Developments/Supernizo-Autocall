import 'server-only';

import type { Call } from '@supernizo/shared';

import { ServiceUnavailableError } from '@/server/errors/app-error';

import { notificationSyncEnabled, notificationSyncSecret, signIntegrationRequest } from './supernizo-signature';

const callResolutionPath = '/api/auth/autocall/notifications/call-resolved';

function receiverUrl(): URL {
  const url = new URL(process.env.SUPERNIZO_BACKEND_URL ?? '');
  const local =
    process.env.NODE_ENV === 'development' &&
    url.protocol === 'http:' &&
    ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (
    (!local && url.protocol !== 'https:') ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    throw new ServiceUnavailableError('Supernizo notification synchronization is not configured.');
  }
  url.pathname = `${url.pathname.replace(/\/$/, '')}${callResolutionPath}`;
  return url;
}

export async function notifySupernizoCallResolution(call: Pick<Call, 'id' | 'status'>): Promise<void> {
  if (!notificationSyncEnabled() || call.status === 'RINGING') return;
  const url = receiverUrl();
  const body = JSON.stringify({ callId: call.id, status: call.status });
  const timestamp = Math.floor(Date.now() / 1_000).toString();
  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      body,
      redirect: 'error',
      cache: 'no-store',
      signal: AbortSignal.timeout(4_000),
      headers: {
        'content-type': 'application/json',
        'x-supernizo-timestamp': timestamp,
        'x-supernizo-signature': signIntegrationRequest(
          notificationSyncSecret(),
          timestamp,
          'POST',
          url.pathname,
          body,
        ),
      },
    });
  } catch {
    throw new ServiceUnavailableError('Supernizo notification synchronization is temporarily unavailable.');
  }
  if (!response.ok) {
    throw new ServiceUnavailableError('Supernizo notification synchronization is temporarily unavailable.');
  }
}
