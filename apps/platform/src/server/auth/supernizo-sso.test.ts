import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  remove: vi.fn(),
  upsert: vi.fn(),
  findUnique: vi.fn(),
  compare: vi.fn(),
}));
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: mocks.get, delete: mocks.remove }),
}));
vi.mock('@/server/db/client', () => ({
  getDatabaseClient: () => ({ user: { upsert: mocks.upsert, findUnique: mocks.findUnique } }),
}));
vi.mock('bcryptjs', () => ({ compare: mocks.compare }));
import {
  authorizeSupernizo,
  requestSupernizoIdentity,
  startSupernizoSignIn,
  ssoUrl,
} from './supernizo-sso';
import { ServiceUnavailableError, UnauthorizedError } from '@/server/errors/app-error';
import { authorizeLocalAdmin } from './local-admin-login';

const subject = '17e772b0-2a9b-4ea6-8d35-e6045e97f8a6';
const identity = {
  subject,
  name: 'Agent',
  role: 'AGENT',
  version: 2,
  expiresAt: Math.floor(Date.now() / 1000) + 600,
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv('NODE_ENV', 'test');
  vi.stubEnv('APP_URL', 'https://autocall.example/autocall-db');
  vi.stubEnv('SUPERNIZO_LIGHT_URL', 'https://app.example');
  vi.stubEnv('SUPERNIZO_HEAVY_URL', 'https://heavy.example');
  vi.stubEnv('SUPERNIZO_BACKEND_URL', 'https://backend.example');
  vi.stubEnv('SUPERNIZO_AUTOCALL_CLIENT_SECRET', 's'.repeat(40));
});

describe('Supernizo browser-bound handoff', () => {
  it('supports HTTP loopback only in development, including the flow cookie', () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('APP_URL', 'http://localhost:3001/autocall-db');
    vi.stubEnv('SUPERNIZO_LIGHT_URL', 'http://localhost:3000');
    const response = startSupernizoSignIn('light');
    expect(new URL(response.headers.get('location')!).origin).toBe('http://localhost:3000');
    expect(response.cookies.get('autocall.sso-flow')).toMatchObject({
      httpOnly: true,
      secure: false,
    });
    for (const host of ['localhost.evil.example', '192.168.1.1', 'example.com']) {
      expect(() => ssoUrl(`http://${host}`)).toThrow();
    }
    vi.stubEnv('NODE_ENV', 'production');
    expect(() => ssoUrl('http://localhost:3001')).toThrow();
    expect(() => startSupernizoSignIn('light')).toThrow();
  });

  it('distinguishes temporary authorization outages from revoked sessions', async () => {
    for (const status of [429, 500, 503]) {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status })));
      await expect(requestSupernizoIdentity('introspect', {})).rejects.toBeInstanceOf(
        ServiceUnavailableError,
      );
    }
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('fetch failed')));
    await expect(requestSupernizoIdentity('introspect', {})).rejects.toBeInstanceOf(
      ServiceUnavailableError,
    );
    for (const status of [401, 403]) {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status })));
      await expect(requestSupernizoIdentity('introspect', {})).rejects.toBeInstanceOf(
        UnauthorizedError,
      );
    }
  });

  it('starts only at an allowlisted portal and keeps verifier in an HttpOnly cookie', () => {
    const response = startSupernizoSignIn('heavy');
    const target = new URL(response.headers.get('location')!);
    const cookie = response.cookies.get('autocall.sso-flow')!;
    const flow = JSON.parse(cookie.value);
    expect(target.origin).toBe('https://heavy.example');
    expect(target.searchParams.get('challenge')).toBe(
      createHash('sha256').update(flow.verifier).digest('base64url'),
    );
    expect(target.searchParams.get('state')).toBe(flow.state);
    expect(cookie).toMatchObject({
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/autocall-db',
    });
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(() => startSupernizoSignIn('https://evil.example')).toThrow();
  });

  it('rejects absent, mismatched and expired browser state before any exchange', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    expect(await authorizeSupernizo({ code: 'c'.repeat(43), state: 's'.repeat(43) })).toBeNull();
    for (const flow of [
      { state: 'x'.repeat(43), verifier: 'v'.repeat(43), createdAt: Date.now(), portal: 'light' },
      {
        state: 's'.repeat(43),
        verifier: 'v'.repeat(43),
        createdAt: Date.now() - 181000,
        portal: 'light',
      },
    ]) {
      mocks.get.mockReturnValue({ value: JSON.stringify(flow) });
      expect(await authorizeSupernizo({ code: 'c'.repeat(43), state: 's'.repeat(43) })).toBeNull();
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('uses immutable subject provisioning and a private, uncached exchange', async () => {
    mocks.get.mockReturnValue({
      value: JSON.stringify({
        state: 's'.repeat(43),
        verifier: 'v'.repeat(43),
        createdAt: Date.now(),
        portal: 'light',
      }),
    });
    mocks.upsert.mockResolvedValue({
      id: 'local-id',
      email: 'agent@example.com',
      displayName: 'Agent',
    });
    const fetchMock = vi.fn().mockResolvedValue(Response.json(identity));
    vi.stubGlobal('fetch', fetchMock);
    const user = await authorizeSupernizo({ code: 'c'.repeat(43), state: 's'.repeat(43) });
    expect(user?.supernizo.subject).toBe(subject);
    expect(mocks.upsert.mock.calls[0]?.[0]?.where).toEqual({ supernizoId: subject });
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      cache: 'no-store',
      redirect: 'error',
      headers: { 'X-Autocall-Secret': 's'.repeat(40) },
    });
    expect(mocks.remove).toHaveBeenCalled();
  });

  it('fails closed on revoked, unavailable and expired identity responses', async () => {
    for (const response of [
      new Response(null, { status: 403 }),
      new Response(null, { status: 503 }),
      Response.json({ ...identity, expiresAt: 1 }),
    ]) {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response));
      await expect(requestSupernizoIdentity('introspect', {})).rejects.toThrow();
    }
  });
});

describe('direct administrator sign-in', () => {
  it('rejects local agents and SSO-linked users even with passwords', async () => {
    for (const user of [
      { globalRole: 'AGENT', passwordHash: 'hash' },
      { globalRole: 'ADMIN', passwordHash: 'hash', supernizoId: subject },
    ]) {
      mocks.findUnique.mockResolvedValue(user);
      expect(
        await authorizeLocalAdmin({ email: 'a@example.com', password: 'password' }),
      ).toBeNull();
    }
    expect(mocks.compare).not.toHaveBeenCalled();
  });
  it('accepts a local administrator only with a valid password', async () => {
    mocks.findUnique.mockResolvedValue({
      globalRole: 'ADMIN',
      passwordHash: 'hash',
      supernizoId: null,
      id: 'admin',
      email: 'a@example.com',
    });
    mocks.compare.mockResolvedValue(false);
    expect(await authorizeLocalAdmin({ email: 'a@example.com', password: 'wrong' })).toBeNull();
    mocks.compare.mockResolvedValue(true);
    expect(
      await authorizeLocalAdmin({ email: 'a@example.com', password: 'correct' }),
    ).toMatchObject({ id: 'admin', role: 'ADMIN' });
  });
});
