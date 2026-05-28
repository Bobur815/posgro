# Deferred Features & Design Decisions

## 1. Per-Store Product Code ✅ DONE (v1.9.0, 2026-05-28)

**Issue:** `product.id` is a global auto-increment on the VPS (shared across all stores). Store 1000's first product got ID 2003 because store 1234 already had 2002 products. The POS UI currently uses `product.id` as a visible product code for search and reference.

**Implemented:**
- Added `storeProductCode INT NULL` to PostgreSQL + SQLite `products` tables
- Migration backfills existing rows with `ROW_NUMBER() OVER (PARTITION BY store_id ORDER BY created_at)`
- Unique index on `(store_id, store_product_code)` — NULLs excluded automatically
- Server auto-assigns `MAX(storeProductCode) + 1` on product creation
- Sync pulls `storeProductCode` from VPS into SQLite
- POS `getById` tries `storeProductCode` first, falls back to `id`
- All UI tables/cards display `storeProductCode ?? id` (fallback for any NULL edge cases)
- No NOT NULL constraint — safe for old app versions still in production

**Remaining (optional):** Add NOT NULL + unique constraint as a follow-up migration once all terminals have synced the new column values.

