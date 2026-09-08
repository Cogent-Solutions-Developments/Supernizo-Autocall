import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DIRECTORY_MAX_BYTES,
  DIRECTORY_SYNC_PATH,
  readDirectoryBody,
  signDirectoryRequest,
  verifyDirectorySignature,
} from './supernizo-signature';
import { DirectoryEventSchema } from './supernizo-contract';

const key = 'directory-test-key-'.repeat(3);
const now = 1_800_000_000_000;
beforeEach(() => vi.stubEnv('SUPERNIZO_DIRECTORY_SYNC_SECRET', key));

describe('directory authentication', () => {
  it('verifies exact bytes, method, path and timestamp', () => {
    const body = '{"subject":"test"}';
    const timestamp = String(now / 1000);
    const headers = new Headers({
      'x-supernizo-timestamp': timestamp,
      'x-supernizo-signature': signDirectoryRequest(
        key,
        timestamp,
        'POST',
        DIRECTORY_SYNC_PATH,
        body,
      ),
    });
    expect(() => verifyDirectorySignature(headers, body, now)).not.toThrow();
    expect(() => verifyDirectorySignature(headers, `${body} `, now)).toThrow('signature');
    expect(() => verifyDirectorySignature(headers, body, now + 301_000)).toThrow('signature');
    expect(() => verifyDirectorySignature(headers, body, now - 301_000)).toThrow('signature');
    headers.set(
      'x-supernizo-signature',
      signDirectoryRequest(key, timestamp, 'POST', '/other', body),
    );
    expect(() => verifyDirectorySignature(headers, body, now)).toThrow('signature');
  });
  it('bounds streamed bodies even without Content-Length', async () => {
    const request = new Request('https://example.test', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: 'x'.repeat(DIRECTORY_MAX_BYTES + 1),
    });
    await expect(readDirectoryBody(request)).rejects.toThrow('too large');
  });
  it('rejects site membership injection and invalid revisions', () => {
    const event = {
      eventId: 'b4eabda4-e2cc-46c1-81ee-c7a2fe36ba41',
      schemaVersion: 1,
      subject: 'dac984ab-a4af-4edb-a6a2-a489f5653c44',
      directoryRevision: '12',
      changedAt: '2026-09-08T00:00:00.000Z',
      user: { displayName: 'Agent', role: 'AGENT', eligibility: 'ELIGIBLE' },
    };
    expect(DirectoryEventSchema.safeParse(event).success).toBe(true);
    expect(DirectoryEventSchema.safeParse({ ...event, siteIds: ['site'] }).success).toBe(false);
    expect(
      DirectoryEventSchema.safeParse({ ...event, directoryRevision: '9223372036854775808' })
        .success,
    ).toBe(false);
  });
});
