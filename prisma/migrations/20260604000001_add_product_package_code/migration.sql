-- Add package_code to products (REGOS:VCR package/unit code for marked goods).
-- Idempotent (ADD COLUMN IF NOT EXISTS) so it is safe to re-run and tolerant of
-- any out-of-band schema drift, per prior migration-recovery lessons.
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "package_code" TEXT;
