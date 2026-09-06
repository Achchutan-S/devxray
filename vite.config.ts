import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // 'prompt' so the user confirms updates instead of the SW swapping under them.
      registerType: 'prompt',
      manifest: {
        name: 'Dev X-Ray',
        short_name: 'DevXRay',
        description:
          'Browser-first developer toolkit: format, decode, convert and inspect — entirely on your machine.',
        theme_color: '#111827',
        background_color: '#111827',
        display: 'standalone',
        orientation: 'any',
        scope: '/',
        start_url: '/',
        icons: [
          {
            src: '/icons/icon-192x192.svg',
            sizes: '192x192',
            type: 'image/svg+xml',
            purpose: 'any maskable',
          },
          {
            src: '/icons/icon-512x512.svg',
            sizes: '512x512',
            type: 'image/svg+xml',
            purpose: 'any maskable',
          },
        ],
        categories: ['developer', 'productivity', 'utilities'],
      },
      workbox: {
        // Monaco's chunk is large; without this it is silently skipped by the
        // precache manifest and the editor stops working offline.
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        globPatterns: ['**/*.{js,css,html,svg,woff2,ttf}'],
        cleanupOutdatedCaches: true,
      },
      devOptions: {
        enabled: true,
        type: 'module',
      },
    }),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    // Bind to loopback only. Vite's dev server has known same-origin weaknesses;
    // there is no reason to expose it on the LAN by default.
    host: '127.0.0.1',
    open: true,
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    chunkSizeWarningLimit: 3400,
    target: ['es2022', 'chrome105', 'safari15.4'],
    rollupOptions: {
      output: {
        /**
         * Function form (rather than the blueprint's static map) so chunking keeps
         * working as later phases add formatter dependencies, with no dead config
         * entries for packages that are not installed yet.
         */
        manualChunks(id: string) {
          if (!id.includes('node_modules')) return undefined;

          // Monaco is shared by most tools, so pin it to one deterministic chunk
          // rather than letting it be duplicated or split across tool chunks.
          if (id.includes('monaco-editor')) return 'monaco';
          if (
            id.includes('/react/') ||
            id.includes('/react-dom/') ||
            id.includes('/scheduler/')
          ) {
            return 'react-vendor';
          }

          // Everything else — parsers and formatters — is deliberately left to
          // Rollup. Each is reachable from exactly one lazily loaded tool, so
          // automatic splitting puts it in that tool's chunk. Grouping them by
          // hand (a "formatters" chunk) would make opening YAML download the
          // GraphQL parser too.
          return undefined;
        },
      },
    },
  },
});
