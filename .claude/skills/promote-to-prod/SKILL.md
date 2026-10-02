---
name: promote-to-prod
description: Checklist to promote dev to main (production) for the posgro server and web - staging verification, backup, migration review, post-deploy checks. Manual only - invoke with /promote-to-prod. Claude never merges or pushes main.
disable-model-invocation: true
allowed-tools: Bash(git status*), Bash(git log*), Bash(git diff*), Bash(npm run lint*), Bash(npm test*), Bash(npx tsc --noEmit*), Bash(npx prisma migrate status*)
---

# Promote dev → main (the user performs the merge)

1. **Diff review:** `git log main..dev --oneline` and `git diff --stat main...dev`. Summarize what ships, per area (server, web, landing, Electron, prisma, infra).
2. `/check` and `/api-compat` are clean. If `prisma/**` changed, the `migration-reviewer` agent says SAFE TO APPLY.
3. **Staging verified** on `https://dev.pos.bobur-dev.uz`: deploy succeeded (GitHub Actions), migrations applied on `posgro_staging`, login works, a test sale syncs from a terminal built against staging, no errors in logs.
4. **Backup first** if there are migrations or data changes: run skill `pg-backup` against production (read-only; it asks before each ssh call) and confirm "RESTORE OK".
5. Feature flags added in this batch default to current behaviour.
6. Electron changes in this batch? Then a version bump exists and the release goes **after** the server is live (`/release-pos`).
7. Tell the user: "Merge dev → main yourself." Deploy is the nightly cron or a manual trigger.
8. **After deploy (ask the user for output or run read-only checks):** `https://pos.bobur-dev.uz/api/health`, container logs clean, migration status up to date, live store still syncing.
9. Rollback: revert the merge and redeploy; migrations are additive so the previous image still works on the new schema.
