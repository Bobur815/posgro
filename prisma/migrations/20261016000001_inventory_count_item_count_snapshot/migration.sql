-- When a stocktake line was counted and the live stock at that instant, so completion can keep
-- sales made after the count. Additive: two nullable columns, metadata-only on PostgreSQL 11+.
-- Existing lines stay NULL and complete exactly as before.
ALTER TABLE "inventory_count_items" ADD COLUMN IF NOT EXISTS "counted_at" TIMESTAMP(3);
ALTER TABLE "inventory_count_items" ADD COLUMN IF NOT EXISTS "stock_at_count" DECIMAL(10,3);
