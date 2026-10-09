import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readProfileRequest } from './profile-request';

const appUrl = 'https://api.infrastructuresg.com/autocall-db';
const appOrigin = new URL(appUrl).origin;
const profile = { displayName: 'Agent', imageUrl: null };

function profileRequest(
  origin: string | null = appOrigin,
  url = 'http://app:3000/autocall-db/api/dashboard/profile',
  headers: Record<string, string> = {},
): Request {
  return new Request(url, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      ...(origin === null ? {} : { Origin: origin }),
      ...headers,
    },
    body: JSON.stringify(profile),
  });
}

beforeEach(() => vi.stubEnv('APP_URL', appUrl));
afterEach(() => vi.unstubAllEnvs());

describe('profile request origin', () => {
  it('accepts the public HTTPS origin behind an internal HTTP proxy URL', async () => {
    await expect(readProfileRequest(profileRequest())).resolves.toEqual(profile);
  });

  it('accepts the configured origin when the request URL is public', async () => {
    await expect(
      readProfileRequest(profileRequest(appOrigin, `${appUrl}/api/dashboard/profile`)),
    ).resolves.toEqual(profile);
  });

  it('accepts local development using its configured port and base path', async () => {
    vi.stubEnv('APP_URL', 'http://localhost:3001/autocall-db');
    await expect(
      readProfileRequest(
        profileRequest(
          'http://localhost:3001',
          'http://localhost:3001/autocall-db/api/dashboard/profile',
        ),
      ),
    ).resolves.toEqual(profile);
  });

  it.each([
    null,
    'null',
    'https://attacker.example',
    'http://api.infrastructuresg.com',
    'https://api.infrastructuresg.com:444',
    'https://api.infrastructuresg.com.attacker.example',
    'https://api.infrastructuresg.com https://attacker.example',
  ])('rejects the untrusted browser origin %s', async (origin) => {
    await expect(readProfileRequest(profileRequest(origin))).rejects.toMatchObject({
      code: 'forbidden',
    });
  });

  it('does not trust matching forged request URLs or proxy headers', async () => {
    await expect(
      readProfileRequest(
        profileRequest(
          'https://attacker.example',
          'https://attacker.example/api/dashboard/profile',
          {
            Host: 'attacker.example',
            'X-Forwarded-Host': 'attacker.example',
            'X-Forwarded-Proto': 'https',
          },
        ),
      ),
    ).rejects.toMatchObject({ code: 'forbidden' });
  });

  it.each([undefined, '', 'not-a-url', 'file:///tmp/profile'])(
    'fails closed when APP_URL is missing or invalid (%s)',
    async (value) => {
      vi.stubEnv('APP_URL', value);
      await expect(
        readProfileRequest(profileRequest(appOrigin, `${appUrl}/api/dashboard/profile`)),
      ).rejects.toMatchObject({ invalidVariables: ['APP_URL'] });
    },
  );
});

describe('profile request body', () => {
  it('requires JSON content', async () => {
    await expect(
      readProfileRequest(
        profileRequest(appOrigin, `${appUrl}/api/dashboard/profile`, {
          'Content-Type': 'text/plain',
        }),
      ),
    ).rejects.toMatchObject({ code: 'validation_error' });
  });

  it('rejects malformed JSON', async () => {
    const request = new Request(`${appUrl}/api/dashboard/profile`, {
      method: 'PATCH',
      headers: { Origin: appOrigin, 'Content-Type': 'application/json' },
      body: '{',
    });
    await expect(readProfileRequest(request)).rejects.toMatchObject({ code: 'validation_error' });
  });

  it('rejects a missing body', async () => {
    const request = new Request(`${appUrl}/api/dashboard/profile`, {
      method: 'PATCH',
      headers: { Origin: appOrigin, 'Content-Type': 'application/json' },
    });
    await expect(readProfileRequest(request)).rejects.toMatchObject({ code: 'validation_error' });
  });

  it('retains the photo payload size limit', async () => {
    const request = new Request(`${appUrl}/api/dashboard/profile`, {
      method: 'PATCH',
      headers: { Origin: appOrigin, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...profile, imageUrl: 'a'.repeat(370_000) }),
    });
    await expect(readProfileRequest(request)).rejects.toMatchObject({ code: 'validation_error' });
  });
});
