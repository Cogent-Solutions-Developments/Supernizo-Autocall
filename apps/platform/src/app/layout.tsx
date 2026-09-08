import type { Metadata } from 'next';
import { Google_Sans } from 'next/font/google';
import type { ReactNode } from 'react';

import { RealtimeClientProvider } from '@/app/components/realtime-client-provider';

import './globals.css';
import '@livekit/components-styles';

const googleSans = Google_Sans({
  display: 'swap',
  subsets: ['latin'],
  variable: '--font-google-sans',
  weight: 'variable',
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
      <body className={googleSans.variable}>
        <RealtimeClientProvider>{children}</RealtimeClientProvider>
      </body>
    </html>
  );
}
