import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// The landing page is served by nginx as STATIC FILES from /var/www/posgro-landing — not proxied
// to NestJS like the dashboard and the portal. That is deliberate: this is the page someone opens
// when something is broken and they are looking for a phone number, so it must not share a fate
// with the API container. The deploy copies the built output out of the image onto the host.
// See nginx/sites/posgro.uz.conf and tasks/DOMAIN_MIGRATION_POSGRO.md §9.
export default defineConfig({
  plugins: [react()],
  resolve: {
    dedupe: ['react', 'react-dom', 'styled-components'],
    alias: {
      '@shared': path.resolve(__dirname, '../../src/shared'),
      '@theme': path.resolve(__dirname, '../../src/renderer/theme'),
      '@branding': path.resolve(__dirname, '../../src/web/src/branding'),
    },
  },
  server: {
    port: 5176,
    proxy: {
      '/api': { target: 'https://dev.api.posgro.uz', changeOrigin: true },
    },
  },
  build: {
    outDir: '../../dist/landing',
    emptyOutDir: true,
  },
  base: '/',
});
