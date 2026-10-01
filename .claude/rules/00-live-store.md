# Live store, branch flow, Windows notes

Loaded every session. Complements `CLAUDE.md` (commands, architecture, staging, versioning, workflow); never overrides it.

## Live store protection (non-negotiable)
- At least one store runs in production. Protecting it beats every other goal.
- Migrations are **additive only** (new tables, nullable/defaulted columns, indexes). No drops, renames, type changes, or `NOT NULL` without default. Expand → backfill → contract, contract in a separate approved release.
- New behaviour ships behind a flag that **defaults to current behaviour**. No hard deletion of live functionality.
- **Compatibility window:** terminals update at different times (electron-updater). The server must keep working with the previous POS release (N-1). Rollout order: server first (merge to `main`, wait for the prod deploy), then publish the installer.
- Tills hold a local SQLite DB that can contain **unsynced sales**. Never wipe, recreate, or reset it. SQLite schema changes must upgrade existing files in place.
- Stores run in offline (SQLite + sync) or online (server) mode (see `MULTI_STORE_SETUP.md`). When touching a data path, verify both.

## Branch and release flow (hooks enforce most of this)
- Develop on `dev`. Push to `dev` auto-deploys staging (`dev.pos.bobur-dev.uz`, DB `posgro_staging`). `main` = production.
- Never push or merge to `main`, never run `npm run deploy:pos`, never run `prisma migrate deploy`. The user does these. Edits on `main` are blocked unless `ALLOW_MAIN_EDITS=1` (hotfix).
- Touching `src/main`, `src/renderer` or `src/shared` requires a `package.json` version bump (Stop hook checks). `src/server`, `src/web`, `src/landing` do not bump.
- Workflow from CLAUDE.md applies: plan into `tasks/todo.md`, wait for approval, record corrections in `tasks/lessons.md`.

## Secrets
- Never read or print `.env*` (except `.env.example`), tokens, DB passwords, JWT secrets, `.pfx/.pem` files.
- `.env.pos` values are **baked into the installer** and extractable. Never put server secrets there; the POS `JWT_SECRET` must differ from the server's.
- Before any build for release, `VPS_API_URL` in `.env.pos` must be the production URL (see skill `release-pos`).

## Windows 11 environment
- Claude Code runs natively on Windows; the Bash tool is Git Bash. Use POSIX commands and forward slashes in the Bash tool; quote paths with spaces.
- Scripts that run on the VPS are LF-only bash (`.gitattributes` enforces `*.sh eol=lf`). Never execute them locally; pipe them over ssh: `ssh posgro-vps 'cd ~/posgro && bash -s' < script.sh`.
- Real hardware (scale, printers, COM ports) is only reachable from this machine. Don't fake hardware behaviour; ask the user to test and paste raw output.
- `npm run build:pos` builds a Windows NSIS installer and needs native toolchains; it is slow. Use `npx cross-env APP_MODE=pos electron-vite build` for a compile check.
- Bilingual: all app UI strings exist in both `ru` and `uz`. Marketing copy for the Fergana audience is O'zbek only.
