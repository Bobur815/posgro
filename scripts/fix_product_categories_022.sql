-- Fix products that have MXIK codes starting with 020/022 (beverages)
-- but are assigned to the wrong category.
-- Moves them to the correct beverages category (Salqin ichimliklar / Напитки).
--
-- Works on production where mxik_group_code column does not exist yet.
-- Safe to run multiple times (idempotent).

BEGIN;

-- Preview (uncomment to check before applying):
/*
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
*/

-- Move products to the beverages category
UPDATE products p
SET category_id = c_bev.id
FROM categories c_bev
WHERE c_bev.store_id = p.store_id
  AND c_bev.name_uz ILIKE '%ichimlik%'
  AND p.mxik IS NOT NULL
  AND LEFT(p.mxik, 3) IN ('020', '022')
  AND p.category_id <> c_bev.id;

-- Verify: 0 means all wrongly categorised products have been moved
SELECT COUNT(*) AS remaining_wrong
FROM products p
JOIN categories c_wrong ON c_wrong.id = p.category_id AND c_wrong.store_id = p.store_id
JOIN categories c_bev   ON c_bev.store_id = p.store_id AND c_bev.name_uz ILIKE '%ichimlik%'
WHERE p.mxik IS NOT NULL
  AND LEFT(p.mxik, 3) IN ('020', '022')
  AND p.category_id <> c_bev.id;

COMMIT;
