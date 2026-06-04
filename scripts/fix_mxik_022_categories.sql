-- Fix categories whose mxik_group_code doesn't match their products' MXIK prefix.
-- Targets: products with MXIK starting with '020' or '022' → category must have mxik_group_code = '022'.
--
-- Safe to run multiple times (idempotent).
-- Run on posgro (production) or posgro_staging.

BEGIN;

-- Preview what will change (uncomment to check before applying)
/*
SELECT
    c.id              AS category_id,
    c.store_id,
    c.name_ru         AS category_name,
    c.mxik_group_code AS current_group_code,
    COUNT(p.id)       AS product_count,
    array_agg(DISTINCT LEFT(p.mxik, 3)) AS mxik_prefixes
FROM categories c
JOIN products p ON p.category_id = c.id AND p.store_id = c.store_id
WHERE p.mxik IS NOT NULL
  AND LEFT(p.mxik, 3) IN ('020', '022')
  AND (c.mxik_group_code IS NULL OR c.mxik_group_code <> '022')
GROUP BY c.id, c.store_id, c.name_ru, c.mxik_group_code
ORDER BY c.store_id, c.name_ru;
*/

-- Update categories that contain products with MXIK prefix 020 or 022
-- but whose mxik_group_code is not yet '022'.
UPDATE categories c
SET mxik_group_code = '022'
WHERE c.id IN (
    SELECT DISTINCT p.category_id
    FROM products p
    WHERE p.mxik IS NOT NULL
      AND LEFT(p.mxik, 3) IN ('020', '022')
      AND p.category_id IS NOT NULL
)
AND (c.mxik_group_code IS NULL OR c.mxik_group_code <> '022');

-- Report how many categories were updated
DO $$
DECLARE
    updated_count INTEGER;
BEGIN
    GET DIAGNOSTICS updated_count = ROW_COUNT;
    RAISE NOTICE 'Updated % category row(s).', updated_count;
END $$;

COMMIT;
