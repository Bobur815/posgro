/*
  Warnings:

  - A unique constraint covering the columns `[store_id,internal_code]` on the table `products` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "products" ADD COLUMN     "bulk_quantity" DECIMAL(10,3) NOT NULL DEFAULT 0,
ADD COLUMN     "can_print_label" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "internal_code" TEXT,
ADD COLUMN     "max_sale_qty" DECIMAL(10,3) NOT NULL DEFAULT 0,
ADD COLUMN     "min_sale_qty" DECIMAL(10,3) NOT NULL DEFAULT 0,
ADD COLUMN     "mxik" TEXT,
ADD COLUMN     "product_type" TEXT NOT NULL DEFAULT 'REGULAR';

-- AlterTable
ALTER TABLE "stores" ADD COLUMN     "plan" TEXT NOT NULL DEFAULT 'free';

-- CreateIndex
CREATE INDEX "products_store_id_mxik_idx" ON "products"("store_id", "mxik");

-- CreateIndex
CREATE UNIQUE INDEX "products_store_id_internal_code_key" ON "products"("store_id", "internal_code");
