-- Rename plan → ai_plan (clarifies this field is AI-scan-specific)
ALTER TABLE "stores" RENAME COLUMN "plan" TO "ai_plan";

-- Rename ai_credits → balance (overall store balance, not just AI)
ALTER TABLE "stores" RENAME COLUMN "ai_credits" TO "balance";

-- Add subscription plan fields
ALTER TABLE "stores" ADD COLUMN "subscription_plan" VARCHAR(20);
ALTER TABLE "stores" ADD COLUMN "subscription_expires_at" TIMESTAMPTZ;
