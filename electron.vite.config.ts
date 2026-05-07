import { defineConfig } from 'electron-vite'
import { resolve } from 'path'
import { loadEnv } from 'vite'

export default defineConfig(({ mode }) => {
  // Load .env.pos (or .env.[mode]) so values are baked into the production bundle.
  // In dev, electron-vite injects these automatically; in the packaged app process.env
  // is bare Node.js — without define, all vars would be undefined/default.
  const env = loadEnv(mode || 'pos', process.cwd(), '')

  const APP_ENV_KEYS = [
    'DATABASE_URL', 'VPS_API_URL', 'TERMINAL_ID', 'STORE_ID', 'STORE_NAME',
    'JWT_SECRET', 'PRINTER_NAME', 'PRINTER_TYPE', 'SYNC_INTERVAL_MS', 'RETRY_INTERVAL_MS',
  ]
  const envDefines = Object.fromEntries(
    APP_ENV_KEYS
      .filter(k => env[k] !== undefined)
      .map(k => [`process.env.${k}`, JSON.stringify(env[k])])
  )

  // electron-vite@5 types use BuildEnvironmentOptions (Vite 6 only); cast to avoid mismatch with Vite 5
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return {
  main: {
    build: {
      outDir: 'dist-electron/main',
      rollupOptions: {
        input: resolve(__dirname, 'src/main/index.ts'),
      },
    },
    define: envDefines,
  },

  preload: {
    build: {
      outDir: 'dist-electron/preload',
      rollupOptions: {
        input: resolve(__dirname, 'src/main/preload.ts'),
      },
    },
  },

  renderer: {
    publicDir: resolve(__dirname, 'public'),
    server: {
      port: 5174,
    },
    build: {
      outDir: 'dist-renderer'
    },
    plugins: [
      {
        // Electron file:// + crossorigin on <script type="module"> blocks execution silently.
        name: 'remove-crossorigin',
        transformIndexHtml(html: string) {
          return html.replace(/ crossorigin/g, '')
        },
      },
    ],
    resolve: {
      alias: {
        '@renderer': resolve(__dirname, 'src/renderer'),
        '@shared': resolve(__dirname, 'src/shared'),
        '@main': resolve(__dirname, 'src/main'),
      }
    }
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any
})
