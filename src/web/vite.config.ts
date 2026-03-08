import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
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
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
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
