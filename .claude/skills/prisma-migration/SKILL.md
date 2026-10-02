---
name: prisma-migration
description: Safe schema change workflow for posgro's two Prisma schemas (PostgreSQL on the VPS, SQLite on POS terminals) with staging rollout. Use whenever the user wants to add or change a table, column, enum, index, relation, or says migration, schema, prisma, "add a field", or sync a new field to the POS.
---

# Schema change workflow (live store)

Decide first which schema(s) change:

| Need | Schema | Version bump |
|------|--------|--------------|
| Server-only data (dashboard, reports, bot) | `prisma/schema.prisma` (PostgreSQL) | no |
| Data the till stores locally | `prisma/schema.sqlite.prisma` (SQLite) | yes (Electron) |
| Field that syncs both ways | both, same name and meaning | yes |

Always **additive**. Ask the user before editing either schema.

## PostgreSQL
1. State the change in one sentence; classify `additive` or `breaking` (breaking → expand/contract redesign).
2. Edit `schema.prisma`: new columns nullable or `@default`; enum values only added.
3. `npx prisma validate && npx prisma format`
4. `npm run prisma:migrate:dev -- --create-only --name <snake_case>` (confirm `DATABASE_URL` is local first).
5. **Read** `prisma/migrations/<ts>_<name>/migration.sql`. Stop on `DROP`, `ALTER COLUMN ... TYPE`, `SET NOT NULL` without default. Big-table indexes: `CREATE INDEX CONCURRENTLY`.
6. Apply locally (`npm run prisma:migrate:dev`), then `npm run prisma:generate`.
7. Update DTOs, seed, tests. Server responses stay additive (N-1 POS).
8. Run the `migration-reviewer` agent and `/api-compat`.
9. Push to `dev`: staging runs `prisma migrate deploy` on `posgro_staging`. Verify there. The user merges to `main`; production migrates on the main deploy. Before a risky migration, back up prod first (`pg-backup`).

## SQLite (till)
1. Edit `schema.sqlite.prisma`, additive only.
2. `npm run prisma:push:sqlite` (local dev DB only), then `npm run prisma:generate:sqlite`.
3. Check how existing tills upgrade their SQLite file in place (grep `src/main/database`). Unsynced sales must survive. Never wipe or recreate the DB.
4. Bump the version, run `/check`, remind the user to run `npm run deploy:pos` after server rollout.

## Rename / retype (expand → contract)
Add new column → dual-write → backfill (batched, idempotent, separate step) → switch reads → wait until every till runs a release that reads the new column → drop old column in a separate, explicitly approved release.

## Flags
New behaviour goes behind a `SystemSetting`/store setting that defaults to current behaviour.
