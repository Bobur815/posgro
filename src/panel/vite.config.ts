import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// The portal is served at the ROOT of panel.posgro.uz. nginx owns that public path and proxies it
// to the /panel prefix NestJS serves from, so `base` is '/' and nothing here knows about /panel.
// See nginx/sites/panel.posgro.uz.conf and tasks/DOMAIN_MIGRATION_POSGRO.md §8.2.
export default defineConfig({
  plugins: [react()],
  resolve: {
    dedupe: ['react', 'react-dom', 'styled-components'],
    alias: {
      '@shared': path.resolve(__dirname, '../../src/shared'),
      '@theme': path.resolve(__dirname, '../../src/renderer/theme'),
    },
  },
  server: {
    port: 5175,
    proxy: {
      '/api': { target: 'https://dev.api.posgro.uz', changeOrigin: true },
      '/releases': { target: 'https://dev.panel.posgro.uz', changeOrigin: true },
      '/downloads': { target: 'https://dev.panel.posgro.uz', changeOrigin: true },
    },
  },
  build: {
    outDir: '../../dist/panel',
    emptyOutDir: true,
  },
  base: '/',
});
