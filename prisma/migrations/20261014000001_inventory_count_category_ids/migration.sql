-- A stocktake can cover several categories. Additive: one array column with a default, so
-- existing rows read '{}' and keep using category_id. Metadata-only on PostgreSQL 11+.
ALTER TABLE "inventory_counts" ADD COLUMN IF NOT EXISTS "category_ids" INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[];
