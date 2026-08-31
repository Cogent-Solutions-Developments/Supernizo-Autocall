import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./apps/platform/src', import.meta.url)),
      '@generated': fileURLToPath(new URL('./generated', import.meta.url)),
      '@supernizo/shared': fileURLToPath(
        new URL('./packages/shared/src/index.ts', import.meta.url),
      ),
      'server-only': fileURLToPath(
        new URL('./apps/platform/src/test/server-only.ts', import.meta.url),
      ),
    },
  },
  test: {
    environment: 'node',
    include: ['apps/platform/src/**/*.test.ts', 'packages/**/src/**/*.test.ts'],
    coverage: {
      reporter: ['text', 'html'],
    },
  },
});
