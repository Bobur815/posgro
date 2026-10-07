-- Product.isValid: false once REGOS:VCR rejected a receipt line for this product, true again after
-- the next inventory arrival. Additive only: one column with a constant default — metadata-only on
-- PG 15 (no table rewrite, no backfill), and every existing product reads as valid.

-- AlterTable
ALTER TABLE "products" ADD COLUMN     "is_valid" BOOLEAN NOT NULL DEFAULT true;
