# Live store, branch flow, Windows notes

Loaded every session. Complements `CLAUDE.md` (commands, architecture, staging, versioning, workflow); never overrides it.

## Live store protection (non-negotiable)
Migrations, flags and the N-1 compatibility window are in `CLAUDE.md` (Hard rules, "Old tills stay in the field").
- Tills hold a local SQLite DB that can contain **unsynced sales**. Never wipe, recreate, or reset it. SQLite schema changes must upgrade existing files in place.
- Stores run in offline (SQLite + sync) or online (server) mode (see `MULTI_STORE_SETUP.md`). When touching a data path, verify both.

## Branch and release flow (hooks enforce most of this)
- Develop on a feature branch, merge to `dev`. Push to `dev` auto-deploys staging (`dev.pos.bobur-dev.uz`, DB `posgro_staging`). `main` = production.
- Merge `dev` → `main` and push it only after asking the user and getting an explicit OK for that merge (CLAUDE.md, Branch & release flow). Every push to `main` also raises a permission prompt; never force-push. Never run `npm run deploy:pos` or `prisma migrate deploy`; the user does these. Edits on `main` are blocked unless `ALLOW_MAIN_EDITS=1` (hotfix).
- Touching `src/main`, `src/renderer` or `src/shared` requires a `package.json` version bump (Stop hook checks). `src/server`, `src/web`, `src/landing` do not bump.
- Workflow from CLAUDE.md applies: plan into `tasks/todo.md`, wait for approval, record corrections in `tasks/lessons.md`.

## Secrets
- `.env.pos` values are **baked into the installer** and extractable. Never put server secrets there; the POS `JWT_SECRET` must differ from the server's.
- Before any build for release, `VPS_API_URL` in `.env.pos` must be the production URL (see skill `release-pos`).

## Windows 11 environment
- Claude Code runs natively on Windows; the Bash tool is Git Bash. Use POSIX commands and forward slashes in the Bash tool; quote paths with spaces.
- Scripts that run on the VPS are LF-only bash (`.gitattributes` enforces `*.sh eol=lf`). Never execute them locally; pipe them over ssh: `ssh posgro-vps 'cd ~/posgro && bash -s' < script.sh`.
- Real hardware (scale, printers, COM ports) is only reachable from this machine. Don't fake hardware behaviour; ask the user to test and paste raw output.
- Bilingual: all app UI strings exist in both `ru` and `uz`. Marketing copy for the Fergana audience is O'zbek only.
