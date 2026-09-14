-- Subscription enforcement.
--
-- subscription_required: stores created from now on are blocked while they have no plan. Every
-- existing store is left false, so one with no plan keeps working until a super admin sets one.
ALTER TABLE "stores" ADD COLUMN "subscription_required" BOOLEAN NOT NULL DEFAULT false;

-- subscription_grace_from: a store already past its expiry date when this ships gets its grace
-- days from today rather than from that old date, so the release does not block it on landing.
-- Cleared whenever a super admin sets the plan or date again.
ALTER TABLE "stores" ADD COLUMN "subscription_grace_from" TIMESTAMP(3);

UPDATE "stores"
SET "subscription_grace_from" = CURRENT_TIMESTAMP
WHERE "subscription_expires_at" IS NOT NULL
  AND "subscription_expires_at" < CURRENT_TIMESTAMP
  AND COALESCE("subscription_plan", '') NOT IN ('', 'VIP');
