import { config } from 'dotenv';
import type { NextConfig } from 'next';
import { resolve } from 'node:path';

// Load workspace settings before NextAuth initializes its URL defaults.
// Explicit launcher/deployment variables and app-local files keep precedence.
for (const name of ['.env.local', '.env']) {
  config({ path: resolve(import.meta.dirname, '../..', name), override: false, quiet: true });
}

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
