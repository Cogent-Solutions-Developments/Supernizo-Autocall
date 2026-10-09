import 'server-only';

import type { NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';

import { APP_BASE_PATH, withAppBasePath } from '@/lib/app-path';
import { authorizeLocalAdmin } from '@/server/interfaces/auth/local-admin-login';
import { getAuthenticationEnvironment } from '@/server/infrastructure/config/env';
import { authorizeSupernizo } from '@/server/interfaces/auth/supernizo-sso';

export function getAuthOptions(): NextAuthOptions {
  const { AUTH_SECRET: secret } = getAuthenticationEnvironment();
  const secure = process.env.NODE_ENV === 'production';
  const cookiePrefix = secure ? '__Secure-' : '';
  const cookieOptions = { httpOnly: true, sameSite: 'lax', path: APP_BASE_PATH, secure } as const;

  return {
    cookies: {
      sessionToken: {
        name: `${cookiePrefix}autocall.session-token`,
        options: cookieOptions,
      },
      csrfToken: {
        name: `${cookiePrefix}autocall.csrf-token`,
        options: cookieOptions,
      },
      callbackUrl: {
        name: `${cookiePrefix}autocall.callback-url`,
        options: cookieOptions,
      },
    },
    callbacks: {
      async jwt({ token, user }) {
        if (user?.id) {
          token.userId = user.id;
          token.supernizo = user.supernizo;
        }

        if (user?.role) {
          token.role = user.role;
        }

        return token;
      },
      async session({ session, token }) {
        if (session.user && typeof token.userId === 'string' && typeof token.role === 'string') {
          session.user.id = token.userId;
          session.user.role = token.role;
          session.user.supernizo = token.supernizo;
        }

        return session;
      },
    },
    pages: {
      signIn: withAppBasePath('/login'),
    },
    providers: [
      CredentialsProvider({
        id: 'supernizo',
        name: 'Supernizo',
        credentials: { code: { type: 'text' }, state: { type: 'text' } },
        async authorize(credentials) {
          try {
            return await authorizeSupernizo(credentials);
          } catch {
            return null;
          }
        },
      }),
      CredentialsProvider({
        credentials: {
          email: { label: 'Email', type: 'email' },
          password: { label: 'Password', type: 'password' },
        },
        async authorize(credentials) {
          try {
            return await authorizeLocalAdmin(credentials);
          } catch {
            return null;
          }
        },
      }),
    ],
    secret,
    session: {
      maxAge: 60 * 60 * 8,
      strategy: 'jwt',
    },
  };
}
