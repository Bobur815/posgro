---
name: release-pos
description: Pre-flight checklist before the user publishes a POS installer to production (version bump, .env.pos URL, server already live, tests). Manual only - invoke with /release-pos.
disable-model-invocation: true
allowed-tools: Bash(npx tsx .claude/skills/release-pos/scripts/check-release.ts), Bash(git status*), Bash(git log*), Bash(git diff*), Bash(npm run lint*), Bash(npm test*), Bash(npx tsc --noEmit*)
---

# Release pre-flight (you never run `deploy:pos`)

Publishing an installer to `https://pos.bobur-dev.uz/releases/` reaches every till through auto-update. Treat it as a production deploy.

1. Run the checker: `npx tsx .claude/skills/release-pos/scripts/check-release.ts`. It verifies branch, clean tree, `.env.pos` `VPS_API_URL` is production (not staging or localhost; prints only that variable), and prints the version.
2. `/check` passes (lint, both tsc projects, tests, electron-vite compile).
3. `package.json` version is bumped vs main and matches the change size (patch fix, minor feature, major breaking).
4. **Server first:** the server changes this release depends on are merged to `main` and deployed to production (`/promote-to-prod` done, health OK). The new POS must also work against the current server.
5. The release was tested against staging (`.env.pos` pointing at `https://dev.pos.bobur-dev.uz`) including a full sync, and `.env.pos` was **restored** to production afterwards.
6. `.env.pos` has no server secrets; POS `JWT_SECRET` differs from the server's.
7. Hardware-affecting changes were tried on a real terminal by the user.
8. Report ✅/❌ per item, then tell the user: "Run `npm run deploy:pos` yourself." Never run it.
