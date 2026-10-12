-- Write-offs outside a stocktake (expired / damaged / other). Additive: two new tables only.
-- CreateTable
CREATE TABLE "write_offs" (
    "id" TEXT NOT NULL,
    "store_id" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "note" TEXT,
    "created_by_id" TEXT NOT NULL,
    "created_by_name" TEXT NOT NULL,
    "total_items" INTEGER NOT NULL DEFAULT 0,
    "total_value" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "write_offs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "write_off_items" (
    "id" TEXT NOT NULL,
    "write_off_id" TEXT NOT NULL,
    "product_id" INTEGER NOT NULL,
    "product_name" TEXT NOT NULL,
    "product_name_uz" TEXT NOT NULL,
    "barcode" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "quantity" DECIMAL(10,3) NOT NULL,
    "cost" DECIMAL(10,2),

    CONSTRAINT "write_off_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "write_offs_store_id_created_at_idx" ON "write_offs"("store_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "write_offs_store_id_number_key" ON "write_offs"("store_id", "number");

-- CreateIndex
CREATE INDEX "write_off_items_write_off_id_idx" ON "write_off_items"("write_off_id");

-- CreateIndex
CREATE INDEX "write_off_items_product_id_idx" ON "write_off_items"("product_id");

-- CreateIndex
CREATE UNIQUE INDEX "write_off_items_write_off_id_product_id_key" ON "write_off_items"("write_off_id", "product_id");

-- AddForeignKey
ALTER TABLE "write_offs" ADD CONSTRAINT "write_offs_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "write_off_items" ADD CONSTRAINT "write_off_items_write_off_id_fkey" FOREIGN KEY ("write_off_id") REFERENCES "write_offs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "write_off_items" ADD CONSTRAINT "write_off_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
