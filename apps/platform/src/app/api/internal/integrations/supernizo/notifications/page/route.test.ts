import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  NOTIFICATION_SYNC_MAX_BYTES,
  NOTIFICATION_SYNC_PATH,
  signIntegrationRequest,
} from '@/server/integrations/supernizo-signature';
import { listNotificationSyncPage } from '@/server/services/notification-sync-service';

import { POST } from './route';

vi.mock('@/server/services/notification-sync-service', () => ({
  listNotificationSyncPage: vi.fn(),
}));

const key = 'notification-route-test-key-'.repeat(3);

function request(body: string, signed = true): Request {
  const timestamp = Math.floor(Date.now() / 1_000).toString();
  return new Request(`https://app.test${NOTIFICATION_SYNC_PATH}`, {
    method: 'POST',
    body,
    headers: {
      'content-type': 'application/json',
      'x-supernizo-signature': signed
        ? signIntegrationRequest(key, timestamp, 'POST', NOTIFICATION_SYNC_PATH, body)
        : 'bad',
      'x-supernizo-timestamp': timestamp,
    },
  });
}

describe('private notification sync feed', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('SUPERNIZO_NOTIFICATION_SYNC_ENABLED', 'true');
    vi.stubEnv('SUPERNIZO_NOTIFICATION_SYNC_SECRET', key);
  });

  it('rejects unsigned requests before querying notifications', async () => {
    expect((await POST(request('{}', false))).status).toBe(401);
    expect(listNotificationSyncPage).not.toHaveBeenCalled();
  });

  it('rejects invalid signed JSON and schema', async () => {
    expect((await POST(request('{'))).status).toBe(400);
    expect((await POST(request('{}'))).status).toBe(400);
    expect(listNotificationSyncPage).not.toHaveBeenCalled();
  });

  it('returns a retryable response while disabled', async () => {
    vi.stubEnv('SUPERNIZO_NOTIFICATION_SYNC_ENABLED', 'false');
    expect((await POST(request(JSON.stringify({ schemaVersion: 1 })))).status).toBe(503);
    expect(listNotificationSyncPage).not.toHaveBeenCalled();
  });

  it('returns a retryable response when its dedicated secret is missing', async () => {
    vi.stubEnv('SUPERNIZO_NOTIFICATION_SYNC_SECRET', '');
    expect((await POST(request(JSON.stringify({ schemaVersion: 1 })))).status).toBe(503);
    expect(listNotificationSyncPage).not.toHaveBeenCalled();
  });

  it('bounds request bodies before querying notifications', async () => {
    expect((await POST(request('x'.repeat(NOTIFICATION_SYNC_MAX_BYTES + 1)))).status).toBe(400);
    expect(listNotificationSyncPage).not.toHaveBeenCalled();
  });

  it('returns an uncached contract page from the service', async () => {
    const page = {
      nextCursor: null,
      notifications: [],
      schemaVersion: 1 as const,
    };
    vi.mocked(listNotificationSyncPage).mockResolvedValue(page);

    const response = await POST(request(JSON.stringify({ limit: 100, schemaVersion: 1 })));

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('x-request-id')).toBeTruthy();
    expect(await response.json()).toEqual(page);
    expect(listNotificationSyncPage).toHaveBeenCalledWith({
      cursor: null,
      limit: 100,
      schemaVersion: 1,
    });
  });
});
