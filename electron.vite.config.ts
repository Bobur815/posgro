import { defineConfig } from 'electron-vite'
import { resolve } from 'path'

export default defineConfig({
  main: {
    build: {
      outDir: 'dist-electron/main',
      lib: {
        entry: resolve(__dirname, 'src/main/index.ts'),
      },
    },
  },

  preload: {
    build: {
      outDir: 'dist-electron/preload', // 👈 ADD THIS
      lib: {
        entry: resolve(__dirname, 'src/main/preload.ts'),
      },
    },
  },

  renderer: {
    server: {
      port: 5174,
    },
    build: {
      outDir: 'dist-renderer'
    },
    resolve: {
      alias: {
        '@renderer': resolve(__dirname, 'src/renderer'),
        '@shared': resolve(__dirname, 'src/shared'),
        '@main': resolve(__dirname, 'src/main'),
      }
    }
  }
})
