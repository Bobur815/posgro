---
paths:
  - "src/main/**"
  - "src/renderer/**"
---

# Electron POS rules

- **IPC chain:** renderer → hook (`src/renderer/hooks`) → `ipc-client.ts` → `preload.ts` (`window.electronAPI`, namespaced) → `src/main/ipc/*-handlers.ts` → SQLite. Never call `ipcRenderer` directly.
- Serialize before crossing IPC: `Decimal` → number (`serializeProduct` pattern), wrap results in `ipcSafe()`.
- Offline-first: every feature works with no network. Writes go to SQLite first and queue for sync; never block a sale on the network.
- State: Zustand stores in `src/renderer/store`. Styling: Styled Components with theme tokens (`spacing`, `colors`, `borderRadius`, `shadows`), works in light and dark. Routing: `HashRouter` only.
- i18n: add every string to BOTH `ru.json` and `uz.json` (`src/renderer/i18n/locales`). DB display uses `nameRu`/`nameUz`.
- Hardware code (serial scale, printers) runs in the main process, never blocks it, has timeouts and reconnect. See skill `pos-hardware`.
- Packaging: `asar: true` with `asarUnpack` for the Prisma query engine. **No `node_modules` ships**; electron-vite bundles main-process packages. A dependency that is native or loaded by path must be added explicitly (`asarUnpack`/`extraFiles`), otherwise it is missing on a till.
- SQLite client (`src/generated/prisma-sqlite/`) is gitignored. After a schema change: edit `prisma/schema.sqlite.prisma` → `npm run prisma:push:sqlite` (dev DB) → `npm run prisma:generate:sqlite`. Existing tills must upgrade in place, additive only.
- Version bump on any change here (`package.json`). `npm version patch --no-git-tag-version` avoids the automatic commit/tag. Remind the user to run `npm run deploy:pos` afterwards; you never run it.
- Fresh clone: run `npm run prisma:generate:sqlite` before `dev:pos` or `npm test`.
