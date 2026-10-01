# Claude Code config for posgro (Windows 11, all areas)

Complements the repo's `CLAUDE.md` (commands, architecture, staging, versioning, workflow). It does **not** replace it and ships no `CLAUDE.md` of its own.

## One-time setup on Windows 11
1. Install **Git for Windows** (gives Git Bash; hooks and the Bash tool use it), **Node 20+**, **Docker Desktop**. Windows 11 already includes the OpenSSH client.
2. Install Claude Code natively from PowerShell: `irm https://claude.ai/install.ps1 | iex`. Run it natively, not in WSL: the NSIS installer and native modules (better-sqlite3, Prisma engines) must be built for Windows.
3. In the repo: `npm install`, then `npm run prisma:generate:sqlite`. The hooks run through `node_modules/tsx`, so install dependencies before the first `claude` session.
4. Add the `posgro-vps` alias to `~/.ssh/config` (see skill `pg-backup`).
5. Append `.gitignore.claude-snippet` to `.gitignore` (personal settings stay out of git).
6. `git config core.longpaths true` (deep `node_modules` paths).
7. Start with `claude --permission-mode plan` for anything non-trivial.

## What is here
| Path | Purpose |
|------|---------|
| `settings.json` | Permissions (allow / ask / deny) and hooks |
| `rules/00-live-store.md` | Always loaded: live-store protection, branch flow, secrets, Windows notes |
| `rules/*.md` (path-scoped) | server, electron, prisma, web-landing, infra |
| `skills/` | prisma-migration, nest-module, ipc-feature, regos-vcr, pos-hardware, pg-backup; manual-only: release-pos, promote-to-prod |
| `commands/` | `/plan`, `/check`, `/api-compat` |
| `agents/migration-reviewer.md` | Read-only schema/migration safety review |
| `hooks/` | guard-bash (blocks destructive commands), branch-guard (no edits on main), format (Prettier), stop-version-check (Electron ⇒ bump), session-start (branch + `tasks/lessons.md`) |

## Hooks in one line each
- **guard-bash:** blocks `down -v`, volume/system prune, `migrate reset/deploy`, `db push` on Postgres, `deploy:pos`, `DROP/TRUNCATE`, push to main, force push, `rm -rf`, mutating ssh to `~/posgro`.
- **branch-guard:** edits are blocked while on `main`. Hotfix bypass: `{"env": {"ALLOW_MAIN_EDITS": "1"}}` in `.claude/settings.local.json`.
- **stop-version-check:** if `src/main|renderer|shared` changed and `package.json` version equals main's, Claude is told to bump it before finishing.

## Not done by Claude (by design)
Merge/push to `main`, `npm run deploy:pos`, `prisma migrate deploy`, anything that mutates production over ssh. The user runs these.
