-- Migration: pending_marking_codes — group-022 marking codes sold while still IN
-- circulation, captured for later REGOS:VCR out-of-circulation fiscalization.
-- Idempotent (IF NOT EXISTS / duplicate_object guards) so it is safe to re-run.

CREATE TABLE IF NOT EXISTS "pending_marking_codes" (
    "id" TEXT NOT NULL,
    "store_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "product_barcode" TEXT,
    "sale_id" TEXT,
    "terminal_id" TEXT NOT NULL,
    "circulation_status" TEXT,
    "fiscalized" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "pending_marking_codes_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "pending_marking_codes_store_id_code_key" ON "pending_marking_codes"("store_id", "code");
CREATE INDEX IF NOT EXISTS "pending_marking_codes_store_id_idx" ON "pending_marking_codes"("store_id");

DO $$ BEGIN
  ALTER TABLE "pending_marking_codes" ADD CONSTRAINT "pending_marking_codes_store_id_fkey"
    FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON UPDATE CASCADE ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
