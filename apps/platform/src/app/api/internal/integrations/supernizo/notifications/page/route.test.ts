import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  NOTIFICATION_SYNC_PATH,
  signIntegrationRequest,
} from '@/server/integrations/supernizo-signature';
import { listNotificationSyncPage } from '@/server/services/notification-sync-service';

import { POST } from './route';

vi.mock('@/server/services/notification-sync-service', () => ({
  listNotificationSyncPage: vi.fn(),
}));

const key = 'notification-route-test-key-'.repeat(3);

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('SUPERNIZO_NOTIFICATION_SYNC_ENABLED', 'true');
  vi.stubEnv('SUPERNIZO_NOTIFICATION_SYNC_SECRET', key);
});

function request(body: string, signed = true): Request {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  return new Request(`https://app.test${NOTIFICATION_SYNC_PATH}`, {
    method: 'POST',
    body,
    headers: {
      'content-type': 'application/json',
      'x-supernizo-timestamp': timestamp,
      'x-supernizo-signature': signed
        ? signIntegrationRequest(key, timestamp, 'POST', NOTIFICATION_SYNC_PATH, body)
        : 'bad',
    },
  });
}

describe('private notification feed', () => {
  it('rejects unsigned and invalid requests', async () => {
    expect((await POST(request('{}', false))).status).toBe(401);
    expect((await POST(request('{}'))).status).toBe(400);
    expect(listNotificationSyncPage).not.toHaveBeenCalled();
  });

  it('returns a retryable response while disabled', async () => {
    vi.stubEnv('SUPERNIZO_NOTIFICATION_SYNC_ENABLED', 'false');
    expect((await POST(request('{}'))).status).toBe(503);
  });

  it('returns a signed notification page without caching', async () => {
    const page = { nextCursor: null, notifications: [], schemaVersion: 1 as const };
    vi.mocked(listNotificationSyncPage).mockResolvedValue(page);
    const response = await POST(request(JSON.stringify({ schemaVersion: 1 })));

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toEqual(page);
  });
});
