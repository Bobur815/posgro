-- Nasiya ledger replication between tills. Additive only: three nullable columns, one column
-- with a default (existing rows read as updated now -> one full pull per till, then deltas),
-- and the pull cursor's index. The table is small (one row per credit sale / payment), so the
-- plain CREATE INDEX is fine here.

-- AlterTable
ALTER TABLE "debt_transactions" ADD COLUMN     "origin_terminal_id" TEXT,
ADD COLUMN     "settle_fiscalize" BOOLEAN,
ADD COLUMN     "settle_tender" TEXT,
ADD COLUMN     "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateIndex
CREATE INDEX "debt_transactions_store_id_updated_at_idx" ON "debt_transactions"("store_id", "updated_at");
