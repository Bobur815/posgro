-- CreateTable
CREATE TABLE "paynet_receipts" (
    "id" TEXT NOT NULL,
    "store_id" TEXT NOT NULL,
    "ofd_url" TEXT NOT NULL,
    "receipt_number" TEXT NOT NULL,
    "terminal_code" TEXT NOT NULL,
    "fiscal_mark" TEXT NOT NULL,
    "issued_at" TIMESTAMP(3) NOT NULL,
    "amount" DECIMAL(12,2),
    "integrated" BOOLEAN NOT NULL DEFAULT false,
    "sale_receipt_number" TEXT,
    "integrated_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "paynet_receipts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "paynet_receipts_store_id_integrated_idx" ON "paynet_receipts"("store_id", "integrated");

-- CreateIndex
CREATE UNIQUE INDEX "paynet_receipts_store_id_receipt_number_key" ON "paynet_receipts"("store_id", "receipt_number");

-- AddForeignKey
ALTER TABLE "paynet_receipts" ADD CONSTRAINT "paynet_receipts_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
