-- CreateEnum
CREATE TYPE "SupplierTransactionType" AS ENUM ('PURCHASE', 'PAYMENT', 'RETURN', 'ADVANCE', 'ADJUSTMENT');

-- CreateEnum
CREATE TYPE "SupplierPaymentMethod" AS ENUM ('CASH', 'CARD', 'BANK_TRANSFER', 'INSTALLMENT', 'ONE_TO_ONE');

-- AlterTable
ALTER TABLE "suppliers" ADD COLUMN     "balance" DECIMAL(12,2) NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "supplier_transactions" (
    "id" TEXT NOT NULL,
    "store_id" TEXT NOT NULL,
    "supplier_id" TEXT NOT NULL,
    "type" "SupplierTransactionType" NOT NULL,
    "payment_method" "SupplierPaymentMethod" NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "description" TEXT,
    "reference_id" TEXT,
    "reference_type" TEXT,
    "due_date" TIMESTAMP(3),
    "paid_at" TIMESTAMP(3),
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "supplier_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "supplier_transactions_store_id_idx" ON "supplier_transactions"("store_id");

-- CreateIndex
CREATE INDEX "supplier_transactions_supplier_id_idx" ON "supplier_transactions"("supplier_id");

-- CreateIndex
CREATE INDEX "supplier_transactions_type_idx" ON "supplier_transactions"("type");

-- CreateIndex
CREATE INDEX "supplier_transactions_created_at_idx" ON "supplier_transactions"("created_at");

-- AddForeignKey
ALTER TABLE "supplier_transactions" ADD CONSTRAINT "supplier_transactions_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_transactions" ADD CONSTRAINT "supplier_transactions_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
