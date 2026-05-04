# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

# Commands

## Development
```bash
npm run dev:server        # NestJS VPS server (watch mode)
npm run dev:pos           # Electron POS app (electron-vite)
cd src/web && npm run dev # Super-admin web dashboard
```

## Build & Deploy
```bash
npm run build:server      # Compile NestJS → dist/server/
npm run build:pos         # Build Electron app + NSIS installer
npm run deploy:pos        # build:pos + upload release to VPS
cd src/web && npm run build  # Build web dashboard (output copied into server)
```

## Database
```bash
npm run prisma:generate         # PostgreSQL Prisma client
npm run prisma:generate:sqlite  # SQLite Prisma client → src/generated/prisma-sqlite/
npm run prisma:migrate:dev      # Create + apply PostgreSQL migration
npm run prisma:migrate:deploy   # Apply migrations in production
npm run prisma:push:sqlite      # Push SQLite schema without migrations
npm run prisma:seed             # Seed PostgreSQL database
```

## Code Quality
```bash
npm run lint     # ESLint on src/**/*.ts,tsx
npm run format   # Prettier on src/**/*.{ts,tsx,json}
npm test         # Jest (ts-jest, matches **/*.test.ts)
npm run test:watch
```

---

# Architecture

## System Overview
Offline-first multi-tenant POS system with three deployable targets:
- **Electron POS app** — runs on Windows terminal, stores data in SQLite, syncs to VPS
- **NestJS server** — runs on VPS, multi-tenant PostgreSQL, serves web dashboard
- **React web dashboard** (`src/web/`) — built separately, served as static files from `/web` route

## Source Layout
| Path | Purpose |
|------|---------|
| `src/main/` | Electron main process (IPC handlers, sync, printer, scale, updater) |
| `src/renderer/` | React UI for POS terminal |
| `src/server/` | NestJS backend (VPS) |
| `src/web/` | Super-admin React dashboard (separate Vite project) |
| `src/shared/` | Types, utils, constants shared across all targets |
| `src/generated/prisma-sqlite/` | Generated SQLite Prisma client (committed, bundled in Electron) |
| `prisma/schema.prisma` | PostgreSQL schema (VPS) |
| `prisma/schema.sqlite.prisma` | SQLite schema (POS terminal) |

## IPC Architecture (Electron)
```
Renderer (React) → hooks → ipc-client.ts → preload.ts (contextBridge) → main process IPC handlers → SQLite
```
- `src/main/preload.ts` exposes `window.electronAPI` with namespaced methods
- `src/main/ipc/` contains handler files per domain (products, sales, auth, settings, etc.)
- Never call `ipcRenderer` directly; always go through `window.electronAPI`

## Data Sync Flow
1. POS terminal writes to SQLite (offline-first)
2. `src/main/sync/sync-service.ts` runs periodic background sync
3. Sales queue → `upload-sync.ts` POSTs to VPS API
4. Products/categories pull down from VPS → overwrite local SQLite
5. `queue-manager.ts` handles auth tokens, retries, and backoff

## Two Prisma Schemas
- PostgreSQL: `prisma/schema.prisma` → generates to `node_modules/.prisma/client`
- SQLite: `prisma/schema.sqlite.prisma` → generates to `src/generated/prisma-sqlite/`
- To add a SQLite field: edit schema → `npm run prisma:push:sqlite` → `npm run prisma:generate:sqlite`
- To add a PostgreSQL field: edit schema → `npm run prisma:migrate:dev`

## Environment Files
- `.env.pos` — baked into Electron bundle at build time via `electron.vite.config.ts`; vars: `DATABASE_URL`, `VPS_API_URL`, `TERMINAL_ID`, `STORE_ID`, `JWT_SECRET`, `PRINTER_NAME`, `PRINTER_TYPE`
- `.env` / `.env.server` — NestJS server config: `DATABASE_URL`, `JWT_SECRET`, `TELEGRAM_BOT_TOKEN`, `ANTHROPIC_API_KEY`, `PORT`
- See `.env.example` for all required variables

## Key Patterns
- **Serialization:** `serializeProduct()` in `products-handlers.ts` converts Prisma `Decimal` → `number` via `.toNumber()` before IPC
- **IPC safety:** `ipcSafe(value)` = `JSON.parse(JSON.stringify(value))` strips non-cloneable types
- **State:** Zustand stores in `src/renderer/store/`; hooks in `src/renderer/hooks/` wrap store + IPC calls
- **Styling:** Styled Components with theme tokens (`spacing`, `colors`, `borderRadius`, `shadows`)
- **Routing:** HashRouter (required for Electron — no BrowserRouter)
- **i18n:** `src/renderer/i18n/locales/ru.json` + `uz.json`; bilingual DB fields use `nameRu`/`nameUz`

## Electron Build Notes
- `asar: false` in `electron-builder.config.js` — Chromium ES modules can't load from `.asar`
- SQLite Prisma client at `src/generated/prisma-sqlite/` is committed and included in the bundle
- Native Prisma query engine binaries are bundled via `extraFiles`
- Release channel: `https://pos.bobur-dev.uz/releases/`

---

# Workflow Orchestration

## 1. Plan Node Default

- Enter plan mode for ANY non-trivial task (3+ steps or architectural decisions)
- If something goes sideways, STOP and re-plan immediately – don't keep pushing
- Use plan mode for verification steps, not just building
- Write detailed specs upfront to reduce ambiguity

## 2. Subagent Strategy

- Use subagents liberally to keep main context window clean
- Offload research, exploration, and parallel analysis to subagents
- For complex problems, throw more compute at it via subagents
- One tack per subagent for focused execution

## 3. Self-Improvement Loop

- After ANY correction from the user: update `tasks/lessons.md` with the pattern
- Write rules for yourself that prevent the same mistake
- Ruthlessly iterate on these lessons until mistake rate drops
- Review lessons at session start for relevant project

## 4. Verification Before Done

- Never mark a task complete without proving it works
- Diff behavior between main and your changes when relevant
- Ask yourself: "Would a staff engineer approve this?"
- Run tests, check logs, demonstrate correctness

## 5. Demand Elegance (Balanced)

- For non-trivial changes: pause and ask "is there a more elegant way?"
- If a fix feels hacky: "Knowing everything I know now, implement the elegant solution"
- Skip this for simple, obvious fixes – don't over-engineer
- Challenge your own work before presenting it

## 6. Autonomous Bug Fixing

- When given a bug report: just fix it. Don't ask for hand-holding
- Point at logs, errors, failing tests – then resolve them
- Zero context switching required from the user
- Go fix failing CI tests without being told how

---

# Task Management

1. **Plan First:** Write plan to `tasks/todo.md` with checkable items
2. **Verify Plan:** Check in before starting implementation
3. **Track Progress:** Mark items complete as you go
4. **Explain Changes:** High-level summary at each step
5. **Document Results:** Add review section to `tasks/todo.md`
6. **Capture Lessons:** Update `tasks/lessons.md` after corrections

---

# Versioning (Electron App)

When making changes to the Electron app (`src/main/`, `src/renderer/`, `src/shared/`), bump `package.json` version before finishing:

- **Bug fix** → `patch` (1.0.0 → 1.0.1)
- **New feature** → `minor` (1.0.0 → 1.1.0)
- **Breaking change / major redesign** → `major` (1.0.0 → 2.0.0)

Rules:
- Server-only changes (`src/server/`, `src/web/`) do NOT bump the version
- Always bump version when the task touches renderer UI, main process, or IPC
- Use `npm version patch|minor|major` or edit `package.json` directly
- Remind the user to run `npm run deploy:pos` after the version bump to upload to VPS

---

# Core Principles

- **Simplicity First:** Make every change as simple as possible. Impact minimal code.
- **No Laziness:** Find root causes. No temporary fixes. Senior developer standards.
- **Minimal Impact:** Changes should only touch what's necessary. Avoid introducing bugs.
