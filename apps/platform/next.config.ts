import type { NextConfig } from 'next';
import { resolve } from 'node:path';

const nextConfig: NextConfig = {
  basePath: '/autocall-db',
  output: 'standalone',
  outputFileTracingRoot: resolve(import.meta.dirname, '../..'),
  reactStrictMode: true,
};

export default nextConfig;
