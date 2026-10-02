-- Bank turnover: the fiscal state tills report per sale, the owner's deposits of fiscalised cash,
-- and the date the "still to deposit" figure counts from. Additive only: nullable columns on
-- stores and sales (metadata-only on PG15, no rewrite of sales), and one new empty table.

-- AlterTable
ALTER TABLE "stores" ADD COLUMN     "bank_cash_start_date" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "sales" ADD COLUMN     "fiscal_status" TEXT,
ADD COLUMN     "fiscal_tender" TEXT,
ADD COLUMN     "fiscalized_at" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "cash_bank_deposits" (
    "id" TEXT NOT NULL,
    "store_id" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "deposited_at" TIMESTAMP(3) NOT NULL,
    "note" TEXT,
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "voided_at" TIMESTAMP(3),
    "voided_by_id" TEXT,

    CONSTRAINT "cash_bank_deposits_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "cash_bank_deposits_store_id_deposited_at_idx" ON "cash_bank_deposits"("store_id", "deposited_at");

-- AddForeignKey
ALTER TABLE "cash_bank_deposits" ADD CONSTRAINT "cash_bank_deposits_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

