-- AlterTable
ALTER TABLE "stores" ADD COLUMN     "scheduled_delete_at" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "terminal_logs" (
    "id" TEXT NOT NULL,
    "store_id" TEXT NOT NULL,
    "terminal_id" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "terminal_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "terminal_logs_store_id_idx" ON "terminal_logs"("store_id");

-- CreateIndex
CREATE INDEX "terminal_logs_store_id_level_idx" ON "terminal_logs"("store_id", "level");

-- CreateIndex
CREATE INDEX "terminal_logs_store_id_timestamp_idx" ON "terminal_logs"("store_id", "timestamp" DESC);

-- AddForeignKey
ALTER TABLE "terminal_logs" ADD CONSTRAINT "terminal_logs_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
