import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import { RealtimeClientProvider } from '@/app/components/realtime-client-provider';

import './globals.css';
import '@livekit/components-styles';

export const metadata: Metadata = {
  title: 'Supernizo Autocall | Your visitor coworker',
  description:
    'Spot live visitor intent, start conversations, and turn the right moments into real connections.',
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
