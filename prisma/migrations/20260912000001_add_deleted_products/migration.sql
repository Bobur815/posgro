-- Products deleted on the dashboard, so terminals can drop their copy on the next sync and cannot
-- upload it back. Purely additive: a new table, nothing existing changes.
CREATE TABLE "deleted_products" (
    "id" SERIAL NOT NULL,
    "store_id" TEXT NOT NULL,
    "barcode" TEXT NOT NULL,
    "product_id" INTEGER NOT NULL,
    "deleted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "deleted_products_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "deleted_products_store_id_deleted_at_idx" ON "deleted_products"("store_id", "deleted_at");

CREATE INDEX "deleted_products_store_id_barcode_idx" ON "deleted_products"("store_id", "barcode");
