import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import { RealtimeClientProvider } from '@/app/components/realtime-client-provider';

import './globals.css';
import '@livekit/components-styles';

export const metadata: Metadata = {
  metadataBase: new URL(process.env.APP_URL ?? 'http://localhost:3000'),
  title: 'Supernizo Autocall | Turn live traffic into real conversation',
  description:
    'See visitor intent in real time, then chat or start a browser call at exactly the right moment.',
  openGraph: {
    title: 'Supernizo Autocall | Turn live traffic into real conversation',
    description:
      'See visitor intent in real time, then chat or start a browser call at exactly the right moment.',
    images: [{ alt: 'Supernizo Autocall', height: 1024, url: '/og.png', width: 1792 }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Supernizo Autocall | Turn live traffic into real conversation',
    description:
      'See visitor intent in real time, then chat or start a browser call at exactly the right moment.',
    images: ['/og.png'],
  },
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
