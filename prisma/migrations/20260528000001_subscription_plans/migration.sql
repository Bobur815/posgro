-- Rename plan → ai_plan (clarifies this field is AI-scan-specific)
ALTER TABLE "stores" RENAME COLUMN "plan" TO "ai_plan";

-- Rename aiCredits → balance (Prisma created the column as camelCase without @map)
ALTER TABLE "stores" RENAME COLUMN "aiCredits" TO "balance";

-- Add subscription plan fields
ALTER TABLE "stores" ADD COLUMN "subscription_plan" VARCHAR(20);
ALTER TABLE "stores" ADD COLUMN "subscription_expires_at" TIMESTAMPTZ;
