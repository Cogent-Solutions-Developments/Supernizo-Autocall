'use client';

import { SessionProvider } from 'next-auth/react';
import type { ReactNode } from 'react';

import { AUTH_API_BASE_PATH } from '@/lib/app-path';

type AuthClientProviderProps = Readonly<{
  children: ReactNode;
}>;

export function AuthClientProvider({ children }: AuthClientProviderProps) {
  return <SessionProvider basePath={AUTH_API_BASE_PATH}>{children}</SessionProvider>;
}
