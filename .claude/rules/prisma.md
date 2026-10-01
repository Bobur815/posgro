---
paths:
  - "prisma/**"
---

# Prisma rules (two schemas)

- `prisma/schema.prisma` = PostgreSQL (VPS, multi-tenant). `prisma/schema.sqlite.prisma` = SQLite (POS terminal). Changing one does not change the other; keep field names aligned where the sync payload carries the field.
- **Additive only**, every time: new table, new nullable column, new column with default, new index. Never drop, rename, retype, or add `NOT NULL` without a default. Never edit an existing migration file.
- PostgreSQL flow: edit schema → `npm run prisma:migrate:dev -- --create-only --name <snake_case>` → **read the generated SQL** → apply locally → push to `dev` (staging runs `migrate deploy` on `posgro_staging`) → verify → user merges to `main`.
- Big-table indexes (`sales`, `sale_items`, stock movements): hand-edit the migration to `CREATE INDEX CONCURRENTLY`.
- SQLite flow: edit schema → `npm run prisma:push:sqlite` (local dev DB only) → `npm run prisma:generate:sqlite` → bump version (Electron rule).
- Backfills are separate, idempotent, batched, and never in the same step as the column add.
- Ask before editing schemas or migrations (permission prompt is expected). Let the `migration-reviewer` agent check the diff.
- `prisma db push` on the PostgreSQL schema, `migrate reset`, and `--accept-data-loss` are blocked by hook.
