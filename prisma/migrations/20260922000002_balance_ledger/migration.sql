-- The store balance's ledger: every top-up, subscription fee and AI scan, written in the same
-- transaction as the balance itself. Additive and empty: history starts the day this ships.
-- The unique key on (store, type, period_start) is what charges each subscription period once.

-- CreateTable
CREATE TABLE "balance_transactions" (
    "id" TEXT NOT NULL,
    "store_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "amount" DECIMAL(12,4) NOT NULL,
    "balance_after" DECIMAL(12,4) NOT NULL,
    "period_start" TIMESTAMP(3),
    "note" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "balance_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "balance_transactions_store_id_created_at_idx" ON "balance_transactions"("store_id", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "balance_transactions_store_id_type_period_start_key" ON "balance_transactions"("store_id", "type", "period_start");

-- AddForeignKey
ALTER TABLE "balance_transactions" ADD CONSTRAINT "balance_transactions_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

