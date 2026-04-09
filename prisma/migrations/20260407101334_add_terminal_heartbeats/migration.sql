/*
  Warnings:

  - You are about to drop the column `can_print_label` on the `products` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "products" DROP COLUMN "can_print_label";

-- CreateTable
CREATE TABLE "terminal_heartbeats" (
    "id" TEXT NOT NULL,
    "store_id" TEXT NOT NULL,
    "terminal_id" TEXT NOT NULL,
    "unsynced_count" INTEGER NOT NULL DEFAULT 0,
    "last_sync_at" TIMESTAMP(3) NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "terminal_heartbeats_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "terminal_heartbeats_store_id_idx" ON "terminal_heartbeats"("store_id");

-- CreateIndex
CREATE UNIQUE INDEX "terminal_heartbeats_store_id_terminal_id_key" ON "terminal_heartbeats"("store_id", "terminal_id");

-- AddForeignKey
ALTER TABLE "terminal_heartbeats" ADD CONSTRAINT "terminal_heartbeats_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
