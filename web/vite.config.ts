import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({ mode }) => {
  // Alútvonal, ha Apache (XAMPP) alatt pl. http://gep/utas/ címen fut. A gyökér .env-ben: BASE_PATH=/utas/
  const env = loadEnv(mode, '..', '');
  const base = `/${(env.BASE_PATH ?? '/').replace(/^\/+|\/+$/g, '')}/`.replace('//', '/');
  return {
  base,
  envDir: '..',
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
        start_url: base,
        scope: base,
        display: 'standalone',
        background_color: '#0f1115',
        theme_color: '#5b2a86',
        icons: [
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
          { src: 'icon-maskable.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'maskable' },
        ],
        shortcuts: [
          { name: 'Közeli megállók', url: `${base}?near=1` },
          { name: 'Forgalmi hírek', url: `${base}alerts` },
          { name: 'Térkép', url: `${base}map` },
        ],
      },
    }),
  ],
  server: { proxy: { [`${base}api`]: { target: 'http://localhost:8787', rewrite: (p: string) => p.slice(base.length - 1) } } },
  };
});
