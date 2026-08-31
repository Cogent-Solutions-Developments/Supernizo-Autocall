'use client';

import { RealtimeProvider } from '@upstash/realtime/client';

import type { ReactNode } from 'react';

type RealtimeClientProviderProps = Readonly<{ children: ReactNode }>;

export function RealtimeClientProvider({ children }: RealtimeClientProviderProps) {
  return (
    <RealtimeProvider api={{ url: '/api/realtime', withCredentials: true }}>
      {children}
    </RealtimeProvider>
  );
}
