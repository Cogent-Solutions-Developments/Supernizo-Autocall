import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from './route';
import {
  DIRECTORY_SYNC_PATH,
  signDirectoryRequest,
} from '@/server/integrations/supernizo-signature';
import { synchronizeDirectoryEvent } from '@/server/services/supernizo-directory-service';

vi.mock('@/server/services/supernizo-directory-service', () => ({
  synchronizeDirectoryEvent: vi.fn(),
}));
const key = 'directory-route-test-key-'.repeat(3);
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('SUPERNIZO_DIRECTORY_SYNC_ENABLED', 'true');
  vi.stubEnv('SUPERNIZO_DIRECTORY_SYNC_SECRET', key);
});
function request(body: string, signed = true): Request {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  return new Request(`https://app.test${DIRECTORY_SYNC_PATH}`, {
    method: 'POST',
    body,
    headers: {
      'content-type': 'application/json',
      'x-supernizo-timestamp': timestamp,
      'x-supernizo-signature': signed
        ? signDirectoryRequest(key, timestamp, 'POST', DIRECTORY_SYNC_PATH, body)
        : 'bad',
    },
  });
}
describe('private directory receiver', () => {
  it('rejects unsigned requests without invoking the database service', async () => {
    expect((await POST(request('{}', false))).status).toBe(401);
    expect(synchronizeDirectoryEvent).not.toHaveBeenCalled();
  });
  it('rejects invalid signed JSON and schema', async () => {
    expect((await POST(request('{'))).status).toBe(400);
    expect((await POST(request('{}'))).status).toBe(400);
    expect(synchronizeDirectoryEvent).not.toHaveBeenCalled();
  });
  it('returns a retryable response while disabled', async () => {
    vi.stubEnv('SUPERNIZO_DIRECTORY_SYNC_ENABLED', 'false');
    expect((await POST(request('{}'))).status).toBe(503);
    expect(synchronizeDirectoryEvent).not.toHaveBeenCalled();
  });
  it('acknowledges the specific event after applying it', async () => {
    const event = {
      eventId: randomUUID(),
      subject: randomUUID(),
      schemaVersion: 1,
      directoryRevision: '2',
      changedAt: '2026-09-08T00:00:00.000Z',
      user: { displayName: 'User', role: 'AGENT', eligibility: 'ELIGIBLE' },
    };
    vi.mocked(synchronizeDirectoryEvent).mockResolvedValue('applied');
    const response = await POST(request(JSON.stringify(event)));
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toMatchObject({
      data: { eventId: event.eventId, outcome: 'applied' },
    });
  });
});
