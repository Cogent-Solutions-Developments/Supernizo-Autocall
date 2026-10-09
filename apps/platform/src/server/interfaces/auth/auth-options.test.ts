import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/server/interfaces/auth/local-admin-login', () => ({ authorizeLocalAdmin: vi.fn() }));
vi.mock('@/server/interfaces/auth/supernizo-sso', () => ({ authorizeSupernizo: vi.fn() }));

import { getAuthOptions } from './auth-options';

afterEach(() => vi.unstubAllEnvs());

describe('authentication cookies', () => {
  it.each(['development', 'production'])(
    'isolates CSRF, callback and session cookies in %s',
    (mode) => {
      vi.stubEnv('NODE_ENV', mode);
      vi.stubEnv('AUTH_SECRET', 's'.repeat(32));
      const options = getAuthOptions();
      const secure = mode === 'production';
      const prefix = secure ? '__Secure-' : '';
      for (const [key, suffix] of [
        ['sessionToken', 'session-token'],
        ['csrfToken', 'csrf-token'],
        ['callbackUrl', 'callback-url'],
      ] as const) {
        expect(options.cookies?.[key]).toEqual({
          name: prefix + 'autocall.' + suffix,
          options: { httpOnly: true, sameSite: 'lax', path: '/autocall-db', secure },
        });
      }
      expect(options.pages?.signIn).toBe('/autocall-db/login');
    },
  );
});
