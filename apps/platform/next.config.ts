import type { NextConfig } from 'next';
import { resolve } from 'node:path';

const nextConfig: NextConfig = {
  basePath: '/autocall-db',
  // Keep the development indicator clear of Heavy's mobile navigation dock.
  devIndicators: { position: 'top-right' },
  // Next.js 16.3 does not emit the root NFT files when Vercel's build adapter is active.
  output: process.env.VERCEL ? undefined : 'standalone',
  outputFileTracingRoot: resolve(import.meta.dirname, '../..'),
  reactStrictMode: true,
  transpilePackages: ['three'],
};

export default nextConfig;
