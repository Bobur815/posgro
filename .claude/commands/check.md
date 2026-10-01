---
description: Lint, typecheck, test, and compile-check only the areas that changed
allowed-tools: Bash(npm run lint*), Bash(npx tsc --noEmit*), Bash(npm test*), Bash(npm run build:server*), Bash(npm --prefix src/web run *), Bash(npm --prefix src/landing run *), Bash(npx cross-env APP_MODE=pos electron-vite build*), Bash(git diff*), Bash(git status*)
---

Changed files vs main:

!`git diff --name-only main...HEAD`

Uncommitted:

!`git status --short`

Run in order, stopping at the first failure (fix it, then re-run that stage):

1. `npm run lint`
2. `npx tsc --noEmit -p tsconfig.json` and `npx tsc --noEmit -p tsconfig.server.json`
3. `npm test`
4. Compile checks, only for areas with changes:
   - `src/server/**` → `npm run build:server`
   - `src/web/**` → `npm --prefix src/web run build`
   - `src/landing/**` → `npm --prefix src/landing run build` (if it has a build script)
   - `src/main/**`, `src/renderer/**`, `src/shared/**` → `npx cross-env APP_MODE=pos electron-vite build` (not the full installer)

If Electron areas changed, also confirm `package.json` version differs from main. Finish with 3 lines: what passed, what you fixed, what is left.
