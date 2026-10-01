---
description: Check this branch for changes that could break the previous POS release or live data
allowed-tools: Bash(git diff*), Bash(git log*)
---

Surface changed vs main:

!`git diff --stat main...HEAD -- src/server src/shared prisma`

Read the full diff of controllers, DTOs, `src/shared`, both Prisma schemas and migrations. Report only breaking or risky changes for a POS terminal running the **previous release** and for the live store:

- removed/renamed/retyped endpoints, fields, enum values, status codes
- new required request fields; changed auth/role rules on endpoints terminals call
- sync payload changes (sales upload, products/categories pull, shifts, reconciliation)
- non-idempotent sales upload behaviour
- migration statements that are not additive; SQLite changes that cannot upgrade an existing till DB in place
- tables used by the Telegram bot

Output a table: change | file | breaks N-1 POS? | fix. If nothing breaks, say so in one line.
