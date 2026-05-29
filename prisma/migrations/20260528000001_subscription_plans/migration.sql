-- Idempotent renames: only rename if the old column still exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name = 'stores' AND column_name = 'plan') THEN
    ALTER TABLE "stores" RENAME COLUMN "plan" TO "ai_plan";
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name = 'stores' AND column_name = 'aiCredits') THEN
    ALTER TABLE "stores" RENAME COLUMN "aiCredits" TO "balance";
  END IF;
END $$;

ALTER TABLE "stores" ADD COLUMN IF NOT EXISTS "subscription_plan" VARCHAR(20);
ALTER TABLE "stores" ADD COLUMN IF NOT EXISTS "subscription_expires_at" TIMESTAMPTZ;
