import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import { RealtimeClientProvider } from '@/app/components/realtime-client-provider';

import './globals.css';
import '@livekit/components-styles';

export const metadata: Metadata = {
  title: 'Supernizo Autocall',
  description: 'Website visitor intelligence and browser calling platform.',
};

type RootLayoutProps = Readonly<{
  children: ReactNode;
}>;

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="en">
      <body>
        <RealtimeClientProvider>{children}</RealtimeClientProvider>
      </body>
    </html>
  );
}
