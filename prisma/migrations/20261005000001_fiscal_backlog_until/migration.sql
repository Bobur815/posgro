-- Paid fiscal backlog service: until when a store's tills may run the backlog stepper. Additive
-- only: one nullable column on stores (metadata-only on PG15, no table rewrite).

-- AlterTable
ALTER TABLE "stores" ADD COLUMN     "fiscal_backlog_until" TIMESTAMP(3);
