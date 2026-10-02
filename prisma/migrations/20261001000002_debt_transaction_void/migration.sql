-- Admin deletes a nasiya ledger row without losing it: three nullable columns, nothing else.
-- Existing rows read as "not voided", which they are.

-- AlterTable
ALTER TABLE "debt_transactions" ADD COLUMN     "void_reason" TEXT,
ADD COLUMN     "voided_at" TIMESTAMP(3),
ADD COLUMN     "voided_by" TEXT;

