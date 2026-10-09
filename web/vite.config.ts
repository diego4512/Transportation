import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      registerType: 'autoUpdate',
      injectManifest: { globPatterns: ['**/*.{js,css,html,svg,png,webmanifest}'], maximumFileSizeToCacheInBytes: 4 * 1024 * 1024 },
      devOptions: { enabled: true, type: 'module' },
      manifest: {
        name: 'BP Utas – budapesti közlekedés',
        short_name: 'BP Utas',
        description: 'Valós idejű indulások, napos oldal, klíma, késés-értesítések – Budapest',
        lang: 'hu',
        start_url: '/',
        display: 'standalone',
        background_color: '#0f1115',
        theme_color: '#5b2a86',
        icons: [
          { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
          { src: '/icon-maskable.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'maskable' },
        ],
        shortcuts: [
          { name: 'Közeli megállók', url: '/?near=1' },
          { name: 'Forgalmi hírek', url: '/alerts' },
          { name: 'Térkép', url: '/map' },
        ],
      },
    }),
  ],
  server: { proxy: { '/api': 'http://localhost:8787' } },
  preview: { proxy: { '/api': 'http://localhost:8787' } },
});
