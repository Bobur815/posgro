-- Add store_product_code column (nullable — existing rows get backfilled below)
ALTER TABLE "products" ADD COLUMN "store_product_code" INTEGER;

-- Backfill existing products with per-store sequential codes based on creation order
WITH ranked AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY store_id ORDER BY created_at) AS rn
  FROM "products"
)
UPDATE "products"
SET store_product_code = ranked.rn
FROM ranked
WHERE "products".id = ranked.id;

-- Unique constraint: per-store product codes must be unique (NULLs are excluded automatically)
CREATE UNIQUE INDEX "products_store_id_store_product_code_key"
  ON "products"("store_id", "store_product_code");
