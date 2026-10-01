---
name: ipc-feature
description: Build a POS terminal feature end to end in Electron (SQLite, main-process IPC handler, preload, ipc-client, hook, Zustand store, React page, i18n ru/uz, version bump). Use whenever the user asks for a new screen, POS feature, settings option, or anything in src/renderer or src/main.
---

# Electron feature workflow

1. **Read first.** Find the closest existing feature and follow its chain end to end. Never invent a parallel pattern.
2. **Data (SQLite):** schema change → skill `prisma-migration` (SQLite section). Additive only; tills upgrade in place.
3. **Main process:** handler in `src/main/ipc/<domain>-handlers.ts`: validate input, use SQLite, serialize `Decimal` → number, wrap in `ipcSafe()`. Hardware or blocking work must not block the main process.
4. **Bridge:** expose it on `window.electronAPI` in `src/main/preload.ts` (namespaced), typed. The renderer never touches `ipcRenderer`.
5. **Renderer:** `ipc-client.ts` wrapper → hook in `src/renderer/hooks` → Zustand store if state is shared → page/components with Styled Components theme tokens, light and dark. `HashRouter` routes only.
6. **Roles:** hide admin-only UI with the existing role guard; the main handler enforces it too.
7. **i18n:** add every string to BOTH `ru.json` and `uz.json`.
8. **Offline-first:** works with no network; writes queue for sync. If it syncs, update the server side (skill `nest-module`) additively and keep N-1 compatibility.
9. **Flag:** anything risky ships behind a setting that defaults to current behaviour.
10. **Version bump** in `package.json` (patch = fix, minor = feature). `/check`, then tell the user to test on a real terminal and to run `npm run deploy:pos` themselves after the server is live on main.
