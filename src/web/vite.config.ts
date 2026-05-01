import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    dedupe: ['react', 'react-dom', 'styled-components', 'i18next', 'react-i18next'],
    alias: {
      '@shared': path.resolve(__dirname, '../../src/shared'),
      '@renderer': path.resolve(__dirname, '../../src/renderer'),
      '@components/common': path.resolve(__dirname, '../../src/renderer/components/common'),
      '@components/products': path.resolve(__dirname, '../../src/renderer/components/products'),
      '@components/suppliers': path.resolve(__dirname, '../../src/renderer/components/suppliers'),
      '@theme': path.resolve(__dirname, '../../src/renderer/theme'),
      '@context': path.resolve(__dirname, '../../src/renderer/context'),
      '@i18n': path.resolve(__dirname, '../../src/renderer/i18n'),
    },
  },
  server: {
    host: true,
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      '/releases': {
        target: 'https://pos.bobur-dev.uz',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: '../../dist/web',
    emptyOutDir: true,
  },
  base: '/web/',
});
