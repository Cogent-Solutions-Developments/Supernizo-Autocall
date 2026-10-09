'use client';

import { RealtimeProvider } from '@upstash/realtime/client';

import type { ReactNode } from 'react';

import { withAppBasePath } from '@/lib/app-path';

type RealtimeClientProviderProps = Readonly<{ children: ReactNode }>;

export function RealtimeClientProvider({ children }: RealtimeClientProviderProps) {
  return (
    <RealtimeProvider api={{ url: withAppBasePath('/api/realtime'), withCredentials: true }}>
      {children}
    </RealtimeProvider>
  );
}
