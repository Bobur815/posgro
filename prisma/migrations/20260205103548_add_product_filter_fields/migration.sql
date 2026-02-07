-- AlterTable
ALTER TABLE "products" ADD COLUMN     "discount_percent" DECIMAL(5,2) DEFAULT 0,
ADD COLUMN     "expiry_date" TIMESTAMP(3),
ADD COLUMN     "is_on_promotion" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "supplier_id" TEXT;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
