# Deferred Features & Design Decisions

## 1. Per-Store Product Code

**Issue:** `product.id` is a global auto-increment on the VPS (shared across all stores). Store 1000's first product got ID 2003 because store 1234 already had 2002 products. The POS UI currently uses `product.id` as a visible product code for search and reference.

**Desired behavior:** Each store should have its own sequential product codes starting from 1 (e.g. 1, 2, 3…).

**Recommended solution when revisiting:**
- Add a `storeProductCode INT` column to the VPS `products` table
- Backfill with `ROW_NUMBER() OVER (PARTITION BY store_id ORDER BY created_at)`
- Add unique constraint on `(store_id, store_product_code)`
- Auto-assign on product creation: `MAX(store_product_code WHERE store_id = ?) + 1`
- Add same column to SQLite schema and include in sync
- Update POS UI to display/search by `storeProductCode` instead of `id`

**Why deferred:** Low priority with current single-client setup. Revisit when multiple stores are live and product catalog size makes the high IDs noticeable/confusing to clients.
