-- Add store_product_code column (nullable — existing products keep their global id as display code)
ALTER TABLE "products" ADD COLUMN "store_product_code" INTEGER;

-- Unique constraint: per-store product codes must be unique (NULLs are excluded automatically)
CREATE UNIQUE INDEX "products_store_id_store_product_code_key"
  ON "products"("store_id", "store_product_code");
