-- Create SupplierPaymentType enum
DO $$ BEGIN
  CREATE TYPE "SupplierPaymentType" AS ENUM ('IMMEDIATE', 'INSTALLMENT');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Add payment_type column to suppliers
ALTER TABLE "suppliers" ADD COLUMN IF NOT EXISTS "payment_type" "SupplierPaymentType" NOT NULL DEFAULT 'IMMEDIATE';
