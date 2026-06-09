# Fix: storeProductCode vs global id "fight"

## Problem
`storeProductCode` (per-store sequential, nullable) and global `id` live in overlapping
numeric ranges. Display uses `storeProductCode ?? id` (non-unique column) and POS lookup
resolves `storeProductCode` first then `id` (ambiguous → wrong product). NULLs come from
`syncBulk` (terminal upload) creating products without a code, plus pre-feature rows.

## Decision
- `storeProductCode` is THE single user-facing product number. Never display/lookup by global `id` in user flows.
- Server is authoritative for code assignment. Terminal-created products show "—" until next sync (no provisional local code).

## Steps
- [ ] **1. Web ProductForm** (`src/web/src/pages/Products/ProductForm.tsx`) — show `storeProductCode` as read-only field (mirror internalCode pattern). Edit: load from getById. Create: "auto-assigned". Do NOT send in payload.
- [ ] **2. Server assignment** (`src/server/modules/products/products.service.ts`) — extract `getNextStoreProductCode(storeId)` helper; call it in `syncBulk()` new-product create (currently NULL — the leak); reuse in `create()`. Optional: `GET /products/next-store-product-code` endpoint.
- [ ] **3. Backfill** (one-time SQL, PostgreSQL) — per store, fill NULL codes from MAX+1 ordered by created_at,id. Respect `@@unique([storeId, storeProductCode])`. Staging first, then prod. Sync pulls down.
- [ ] **4. Unify display** — drop `?? id`, use `?? "—"`:
  - `src/renderer/pages/Products/ProductList.tsx:173`
  - `src/web/src/pages/Products/ProductList.tsx:409` and `:616`
  - Audit ProductDetails, PrintTagsModal, both StockManagement.tsx
- [ ] **5. Disambiguate lookup** (`src/main/ipc/products-handlers.ts`):
  - `getById` default path (226-238): drop global-id fallback; keep `byDbId` path
  - `products:search` (264-266): remove `id` from numeric OR
  - `products:getAll` (125-126): numeric query → storeProductCode
- [ ] **6. Terminal create** — no change (server-authoritative; "—" until sync, covered by step 4).
- [ ] **7. Verify** — lint, test, manual (web create, terminal create+sync, POS code lookup, no dup numbers). Bump package.json patch; remind `npm run deploy:pos`.

## Review
(to be filled after implementation)
