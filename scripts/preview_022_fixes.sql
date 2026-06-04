-- ============================================================================
-- PREVIEW ONLY — 022/020 beverage category fixes
-- ----------------------------------------------------------------------------
-- Read-only. Performs NO writes. Wrapped in a read-only transaction so an
-- accidental UPDATE could not commit. Run on posgro_staging first, then posgro.
--
-- Pair scripts (the ones that actually write):
--   scripts/fix_product_categories_022.sql  (moves products  -> beverages category)
--   scripts/fix_mxik_022_categories.sql      (tags categories -> mxik_group_code='022')
-- ============================================================================

BEGIN;
SET TRANSACTION READ ONLY;

-- ----------------------------------------------------------------------------
-- 0) AMBIGUITY CHECK (run this first)
--    fix_product_categories_022.sql matches the beverages category by
--    name_uz ILIKE '%ichimlik%'. If any store has MORE THAN ONE matching
--    category, that UPDATE is non-deterministic. Any row with cnt > 1 below
--    means DO NOT run fix_product_categories_022.sql as-is for that store.
-- ----------------------------------------------------------------------------
SELECT
    c.store_id,
    COUNT(*)                              AS ichimlik_category_count,
    array_agg(c.id  ORDER BY c.id)        AS category_ids,
    array_agg(c.name_ru ORDER BY c.id)    AS category_names
FROM categories c
WHERE c.name_uz ILIKE '%ichimlik%'
GROUP BY c.store_id
ORDER BY ichimlik_category_count DESC, c.store_id;

-- ----------------------------------------------------------------------------
-- 1) PREVIEW for fix_product_categories_022.sql
--    Products with MXIK prefix 020/022 currently in the WRONG category,
--    and where they would be moved to. product_count = rows that would change.
-- ----------------------------------------------------------------------------
SELECT
    p.store_id,
    c_wrong.name_ru   AS wrong_category,
    c_bev.name_ru     AS will_move_to,
    COUNT(*)          AS product_count
FROM products p
JOIN categories c_wrong ON c_wrong.id = p.category_id AND c_wrong.store_id = p.store_id
JOIN categories c_bev   ON c_bev.store_id = p.store_id AND c_bev.name_uz ILIKE '%ichimlik%'
WHERE p.mxik IS NOT NULL
  AND LEFT(p.mxik, 3) IN ('020', '022')
  AND p.category_id <> c_bev.id
GROUP BY p.store_id, c_wrong.name_ru, c_bev.name_ru
ORDER BY p.store_id, product_count DESC;

-- ----------------------------------------------------------------------------
-- 2) PREVIEW for fix_mxik_022_categories.sql
--    Categories that contain 020/022 products but whose mxik_group_code
--    is not yet '022'. These rows would be updated to '022'.
-- ----------------------------------------------------------------------------
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

ROLLBACK;
