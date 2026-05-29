ALTER TABLE "supplier_transactions"
  ALTER COLUMN "description" TYPE JSONB
  USING CASE
    WHEN description IS NULL THEN NULL
    WHEN description ~ '^[{[]' THEN description::JSONB
    ELSE to_jsonb(description)
  END;
