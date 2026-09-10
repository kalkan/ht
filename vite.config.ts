import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf-8')) as { version: string };

/**
 * Base path. Netlify serves the app from the site root, so this stays "/".
 * VITE_BASE_PATH is only needed when hosting under a sub-path.
 */
const base = process.env.VITE_BASE_PATH ?? '/';

export default defineConfig({
  base,
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      injectRegister: false,
      includeAssets: ['icons/apple-touch-icon.png', 'icons/favicon.svg'],
      manifest: {
        name: 'Daily',
        short_name: 'Daily',
        description: 'Kişisel günlük takip uygulaması',
        lang: 'tr',
        dir: 'ltr',
        start_url: base,
        scope: base,
        id: base,
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#f5f5f7',
        theme_color: '#f5f5f7',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'icons/icon-512-maskable.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // Cache the full application shell so the app opens offline.
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
        navigateFallback: `${base}index.html`,
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        // skipWaiting is intentionally false: the app shows "Yeni sürüm mevcut"
        // and only activates the new SW when the user taps "Güncelle".
        skipWaiting: false,
        // Never cache Apps Script calls - they are live API requests.
        runtimeCaching: [],
      },
      devOptions: { enabled: false },
    }),
  ],
  build: {
    target: 'es2020',
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (/[\\/]node_modules[\\/](recharts|d3-|victory-|internmap|delaunator|robust-predicates)/.test(id)) return 'recharts';
          if (/[\\/]node_modules[\\/](dexie|dexie-react-hooks)[\\/]/.test(id)) return 'dexie';
          if (/[\\/]node_modules[\\/](react|react-dom|scheduler)[\\/]/.test(id)) return 'react';
          return 'vendor';
        },
      },
    },
  },
});
