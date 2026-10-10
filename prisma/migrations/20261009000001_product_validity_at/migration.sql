-- Product.validityAt: when a till saw the outcome Product.isValid now holds (a REGOS rejection, or
-- a fiscalised receipt with the product on it). POST /products/validity applies a report only when
-- it is newer than this, so the latest report wins across tills. Additive only: nullable, no
-- default, no backfill; metadata-only on PG 15. NULL = no report yet, so any report applies.

-- AlterTable
ALTER TABLE "products" ADD COLUMN     "validity_at" TIMESTAMP(3);
