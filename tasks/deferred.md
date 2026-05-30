# Deferred Features & Design Decisions

## 1. Per-Store Product Code ✅ DONE (v1.9.0, 2026-05-28)

**Issue:** `product.id` is a global auto-increment on the VPS (shared across all stores). Store 1000's first product got ID 2003 because store 1234 already had 2002 products. The POS UI currently uses `product.id` as a visible product code for search and reference.

**Implemented:**
- Added `storeProductCode INT NULL` to PostgreSQL + SQLite `products` tables
- Existing products keep `storeProductCode = NULL` — they continue displaying their global `id` (already printed on shelf labels, no reprint needed)
- Unique index on `(store_id, store_product_code)` — NULLs excluded automatically
- Server auto-assigns `MAX(storeProductCode) + 1` on product creation
- Sync pulls `storeProductCode` from VPS into SQLite
- POS `getById` tries `storeProductCode` first, falls back to `id`
- All UI tables/cards display `storeProductCode ?? id` (fallback for any NULL edge cases)
- No NOT NULL constraint — safe for old app versions still in production

**Remaining (optional):** Add NOT NULL + unique constraint as a follow-up migration once all terminals have synced the new column values.


## 2. Subscription Plans ✅ DONE (v1.9.0, 2026-05-28)

**Issue:** `Store.plan` was overloaded for AI scanning tier. Need a separate subscription plan system for billing.

**Implemented:**
- Renamed `Store.plan` → `aiPlan` (DB: `ai_plan`), `Store.aiCredits` → `balance` (DB: `balance`)
- Added `Store.subscriptionPlan` (STARTER | PRO | VIP | null) and `Store.subscriptionExpiresAt` (null = perpetual)
- VIP = all features, perpetual license for clients who purchased the app
- Plan prices stored in `SiteConfig`: keys `subscription_price_starter/pro/vip` (UZS)
- New endpoints: `GET /site-config/subscription-plans` (public), `PUT /site-config/subscription-plans` (super admin)
- New web page: `/admin/subscription-plans` — super admin sets plan prices
- `StoreDetailModal` — subscription plan section (STARTER/PRO/VIP buttons + expiry date)
- `StoreList` — plan badge shows subscription plan (VIP=purple, PRO=blue, STARTER=green)

**Remaining (deferred):**
- Feature gating: enforce plan limits per subscription tier (e.g. terminal count, analytics access)
- Add "free trial" support (subscriptionPlan = "TRIAL" + 14-day expiresAt)
- Auto-expiry notifications / suspend stores with expired plans

