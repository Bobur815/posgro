-- Split payment: the tenders of a receipt paid by more than one method (sales.payment_method =
-- 'mixed'). Additive only: one new empty table; existing sales keep their single payment_method
-- and get no rows. Keyed (store_id, receipt_number) like the sale, because the lines sync on their
-- own endpoint and may arrive before or after it.

-- CreateTable
CREATE TABLE "sale_payments" (
    "id" TEXT NOT NULL,
    "store_id" TEXT NOT NULL,
    "receipt_number" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sale_payments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sale_payments_store_id_receipt_number_method_key" ON "sale_payments"("store_id", "receipt_number", "method");

-- AddForeignKey
ALTER TABLE "sale_payments" ADD CONSTRAINT "sale_payments_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
