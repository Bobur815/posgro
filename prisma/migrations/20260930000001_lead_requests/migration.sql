-- CreateTable
CREATE TABLE "lead_requests" (
    "id" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "store_name" TEXT NOT NULL,
    "store_type" TEXT NOT NULL,
    "lang" TEXT NOT NULL DEFAULT 'uz',
    "status" TEXT NOT NULL DEFAULT 'NEW',
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lead_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "lead_requests_status_created_at_idx" ON "lead_requests"("status", "created_at" DESC);

