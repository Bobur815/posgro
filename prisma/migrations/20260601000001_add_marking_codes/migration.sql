-- Migration: add mxik_group_code to categories + sold_marking_codes table
-- Uses IF NOT EXISTS guards because mxik_group_code already exists in production DB

DO $$ BEGIN
  ALTER TABLE "categories" ADD COLUMN "mxik_group_code" TEXT;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "sold_marking_codes" (
    "id" TEXT NOT NULL,
    "store_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "product_barcode" TEXT,
    "terminal_id" TEXT NOT NULL,
    "sold_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "sold_marking_codes_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "sold_marking_codes_store_id_code_key" ON "sold_marking_codes"("store_id", "code");
CREATE INDEX IF NOT EXISTS "sold_marking_codes_store_id_idx" ON "sold_marking_codes"("store_id");

DO $$ BEGIN
  ALTER TABLE "sold_marking_codes" ADD CONSTRAINT "sold_marking_codes_store_id_fkey"
    FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON UPDATE CASCADE ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
