-- Terminal limits per plan: paid extra terminals on a store, and the registry of terminals holding
-- one of its slots (shared/utils/subscription.ts#terminalAllowance).
--
-- Safe to apply to a live store: extra_terminals defaults to 0, and the backfill at the bottom
-- gives every till already in the field its slot, so no running terminal loses one on the day
-- this ships. A store running more tills than its plan now includes shows as over its limit on
-- the super admin's screen; only a NEW terminal is refused.

-- AlterTable
ALTER TABLE "stores" ADD COLUMN     "extra_terminals" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "store_terminals" (
    "id" TEXT NOT NULL,
    "store_id" TEXT NOT NULL,
    "terminal_id" TEXT NOT NULL,
    "first_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "store_terminals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "store_terminals_store_id_idx" ON "store_terminals"("store_id");

-- CreateIndex
CREATE UNIQUE INDEX "store_terminals_store_id_terminal_id_key" ON "store_terminals"("store_id", "terminal_id");

-- AddForeignKey
ALTER TABLE "store_terminals" ADD CONSTRAINT "store_terminals_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Backfill: every terminal this server has heard from. Heartbeats name the tills that sync;
-- sales also name satellites, whose receipts reach here through their main. Sales only from the
-- last 90 days, so a till retired long ago does not sit on a slot. The id is derived rather than a
-- cuid (none can be made in SQL); it only has to be unique, and (store, terminal) already is.
INSERT INTO "store_terminals" ("id", "store_id", "terminal_id", "first_seen_at", "last_seen_at")
SELECT md5(seen.store_id || ':' || seen.terminal_id), seen.store_id, seen.terminal_id,
       MIN(seen.first_at), MAX(seen.last_at)
FROM (
    SELECT "store_id", "terminal_id", "last_sync_at" AS first_at, "last_sync_at" AS last_at
    FROM "terminal_heartbeats"
    UNION ALL
    SELECT "store_id", "terminal_id", MIN("created_at"), MAX("created_at")
    FROM "sales"
    WHERE "created_at" > NOW() - INTERVAL '90 days' AND "terminal_id" <> ''
    GROUP BY "store_id", "terminal_id"
) AS seen
JOIN "stores" ON "stores"."id" = seen.store_id
GROUP BY seen.store_id, seen.terminal_id
ON CONFLICT ("store_id", "terminal_id") DO NOTHING;
