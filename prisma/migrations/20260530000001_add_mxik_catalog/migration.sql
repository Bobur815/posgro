-- Add mxik_group_code to categories
-- Idempotent: the column already exists in some production DBs (schema drift),
-- so guard against duplicate_column instead of failing the whole migration.
DO $$ BEGIN
  ALTER TABLE "categories" ADD COLUMN "mxik_group_code" TEXT;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;
CREATE INDEX IF NOT EXISTS "categories_mxik_group_code_idx" ON "categories"("mxik_group_code");

-- Create mxik_catalog table
CREATE TABLE IF NOT EXISTS "mxik_catalog" (
    "id"                  SERIAL PRIMARY KEY,
    "mxik_code"           TEXT NOT NULL,
    "mxik_name"           TEXT NOT NULL,
    "group_code"          TEXT NOT NULL,
    "group_name"          TEXT NOT NULL,
    "class_code"          TEXT NOT NULL,
    "class_name"          TEXT NOT NULL,
    "position_code"       TEXT NOT NULL,
    "position_name"       TEXT NOT NULL,
    "sub_position_code"   TEXT NOT NULL,
    "sub_position_name"   TEXT NOT NULL,
    "brand_code"          TEXT,
    "brand_name"          TEXT,
    "attribute_name"      TEXT,
    "international_code"  TEXT,
    "unit_name"           TEXT,
    "common_unit_name"    TEXT,
    "created_at"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "mxik_catalog_mxik_code_key"      ON "mxik_catalog"("mxik_code");
CREATE INDEX        IF NOT EXISTS "mxik_catalog_group_code_idx"      ON "mxik_catalog"("group_code");
CREATE INDEX        IF NOT EXISTS "mxik_catalog_class_code_idx"      ON "mxik_catalog"("class_code");
CREATE INDEX        IF NOT EXISTS "mxik_catalog_international_code_idx" ON "mxik_catalog"("international_code");
