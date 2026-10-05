---
paths:
  - "tasks/GROCERY_POS_DOCUMENTATION.md"
---

# Known inconsistencies in `GROCERY_POS_DOCUMENTATION.md` (verify against code, don't trust blindly)

- Login DTO says `username`; `User` model has `phone`.
- `SaleItem.productId` is `String` but `Product.id` is `Int` (relation won't validate as written).
- Sync code posts a flat `{...sale, terminalId}`; the API section documents `{ sale, items }`.
- `GET /api/products?updatedAfter=` is used by sync but not listed in the endpoint docs.
- Doc lists Postgres 15 — that one is correct (prod is 15; 17 is the separate `telegram-bots` DB). `CORS_ORIGINS=*` and published `5432` are dev defaults, not prod-safe.
- Doc layout may be stale (e.g. a web/admin app may exist) — `ls` the repo before assuming paths.
