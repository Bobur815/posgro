-- Nasiya (selling on credit): a CLIENT role for customers who run a tab, a balance and a ledger
-- behind it, and the paid/owed split on every sale.
--
-- Safe to apply to a live store: every column added here defaults to 0 or NULL, which reads as
-- "nobody owes anything" — true of every shop until someone uses the feature. The one exception
-- is the paid_amount backfill at the bottom, which is there precisely so history keeps meaning
-- what it meant.

-- AlterEnum
--
-- Postgres allows this inside a transaction from 12 onwards as long as the new value is not USED
-- in the same transaction; nothing below references 'CLIENT', so this is safe as written.
ALTER TYPE "UserRole" ADD VALUE 'CLIENT';

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "debt" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "debt_due_date" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "sales" ADD COLUMN     "debt_amount" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN     "debt_user_id" TEXT,
ADD COLUMN     "paid_amount" DECIMAL(10,2) NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "debt_transactions" (
    "id" TEXT NOT NULL,
    "store_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "payment_method" TEXT,
    "sale_id" TEXT,
    "settled_at" TIMESTAMP(3),
    "due_date" TIMESTAMP(3),
    "note" TEXT,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "debt_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "debt_transactions_store_id_user_id_idx" ON "debt_transactions"("store_id", "user_id");

-- CreateIndex
CREATE INDEX "debt_transactions_user_id_settled_at_idx" ON "debt_transactions"("user_id", "settled_at");

-- CreateIndex
CREATE INDEX "debt_transactions_sale_id_idx" ON "debt_transactions"("sale_id");

-- AddForeignKey
ALTER TABLE "debt_transactions" ADD CONSTRAINT "debt_transactions_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "debt_transactions" ADD CONSTRAINT "debt_transactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Backfill: every receipt taken before this migration was paid for in full, so the money it
-- collected is its whole final amount. Left at the column default of 0 each one would read as
-- "nothing was paid", and any drawer or takings figure computed from paid_amount would report a
-- shop's entire history as sold on credit.
--
-- Deliberately one-shot and inside this migration, not a repeated job: after this, a sale with
-- paid_amount = 0 is a real credit sale and must stay that way. Mirrors migration 35 in
-- src/main/database/sqlite-client.ts, which does the same for a terminal's own database.
UPDATE "sales" SET "paid_amount" = "final_amount" WHERE "paid_amount" = 0;
