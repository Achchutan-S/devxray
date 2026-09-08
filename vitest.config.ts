import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      // Dev X-Ray compiles the package from source so a stale dist/ can never
      // silently ship. Published consumers resolve dist/ via package exports.
      '@devxray/graphql-formatter': fileURLToPath(
        new URL('./packages/graphql-formatter/src/index.ts', import.meta.url),
      ),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'scripts/**/*.test.ts', 'packages/*/test/**/*.test.ts'],
  },
});
