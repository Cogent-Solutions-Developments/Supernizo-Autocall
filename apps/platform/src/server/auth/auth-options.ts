import 'server-only';

import { compare } from 'bcryptjs';
import type { NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import { z } from 'zod';

import { getDatabaseClient } from '@/server/db/client';
import { getAuthenticationEnvironment } from '@/server/env';

const LoginCredentialsSchema = z.object({
  email: z.string().trim().email().max(191),
  password: z.string().min(1).max(1024),
});

export function getAuthOptions(): NextAuthOptions {
  const { AUTH_SECRET: secret } = getAuthenticationEnvironment();

  return {
    callbacks: {
      async jwt({ token, user }) {
        if (user?.id) {
          token.userId = user.id;
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
        }

        return session;
      },
    },
    pages: {
      signIn: '/login',
    },
    providers: [
      CredentialsProvider({
        credentials: {
          email: { label: 'Email', type: 'email' },
          password: { label: 'Password', type: 'password' },
        },
        async authorize(credentials) {
          const parsedCredentials = LoginCredentialsSchema.safeParse(credentials);

          if (!parsedCredentials.success) {
            return null;
          }

          const prisma = getDatabaseClient();
          const user = await prisma.user.findUnique({
            where: { email: parsedCredentials.data.email },
            select: {
              displayName: true,
              email: true,
              globalRole: true,
              id: true,
              passwordHash: true,
            },
          });

          if (!user?.passwordHash) {
            return null;
          }

          const isPasswordValid = await compare(parsedCredentials.data.password, user.passwordHash);

          if (!isPasswordValid) {
            return null;
          }

          return {
            email: user.email,
            id: user.id,
            name: user.displayName,
            role: user.globalRole,
          };
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
