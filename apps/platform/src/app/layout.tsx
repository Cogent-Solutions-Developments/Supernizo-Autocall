import type { Metadata } from 'next';
import { Geist } from 'next/font/google';
import type { ReactNode } from 'react';

import { RealtimeClientProvider } from '@/app/components/realtime-client-provider';

import './globals.css';
import '@livekit/components-styles';

const appSans = Geist({
  display: 'swap',
  subsets: ['latin'],
  variable: '--font-app-sans',
});

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
      <body className={appSans.variable}>
        <RealtimeClientProvider>{children}</RealtimeClientProvider>
      </body>
    </html>
  );
}
