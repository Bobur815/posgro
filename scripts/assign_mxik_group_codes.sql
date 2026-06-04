-- ============================================================================
-- Assign mxik_group_code to categories by name.
-- SQL port of scripts/map-mxik-to-categories.ts (same keyword rules, same order).
-- ----------------------------------------------------------------------------
-- Idempotent: each rule only touches categories whose mxik_group_code IS NULL,
-- and rules run in priority order, so the FIRST matching rule wins (later rules
-- skip an already-set row). Safe to re-run.
--
-- categories has no updated_at column (PG); syncCategories() does a full pull,
-- so the change still reaches terminals.
--
-- DRY RUN: change the final COMMIT to ROLLBACK — the closing SELECT still shows
-- exactly what WOULD be set, without persisting anything.
-- ============================================================================

BEGIN;

-- ── Food groups ─────────────────────────────────────────────────────────────
-- 002 Meat
UPDATE categories SET mxik_group_code='002' WHERE mxik_group_code IS NULL AND (
  name_uz ILIKE '%go''sht%' OR name_ru ILIKE '%мяс%' OR name_uz ILIKE '%kolbas%' OR name_ru ILIKE '%колбас%');

-- 003 Fish / seafood
UPDATE categories SET mxik_group_code='003' WHERE mxik_group_code IS NULL AND (
  name_uz ILIKE '%baliq%' OR name_ru ILIKE '%рыб%' OR name_uz ILIKE '%dengiz%');

-- 004 Dairy
UPDATE categories SET mxik_group_code='004' WHERE mxik_group_code IS NULL AND (
  name_uz ILIKE '%sut%' OR name_ru ILIKE '%молоч%' OR name_uz ILIKE '%qatiq%' OR name_uz ILIKE '%kefir%'
  OR name_uz ILIKE '%tvorog%' OR name_ru ILIKE '%творог%' OR name_ru ILIKE '%сыр%' OR name_uz ILIKE '%pishloq%');

-- 004 Eggs (animal products)
UPDATE categories SET mxik_group_code='004' WHERE mxik_group_code IS NULL AND (
  name_uz ILIKE '%tuxum%' OR name_ru ILIKE '%яйц%');

-- 004 Ice cream (dairy)
UPDATE categories SET mxik_group_code='004' WHERE mxik_group_code IS NULL AND (
  name_uz ILIKE '%muzqaymoq%' OR name_ru ILIKE '%мороженое%');

-- 007,008 Fruits & vegetables (combined) — MUST precede the separate 007 / 008 rules
UPDATE categories SET mxik_group_code='007,008' WHERE mxik_group_code IS NULL AND (
  name_uz ILIKE '%meva va sabzavot%' OR name_ru ILIKE '%фрукты и овощ%' OR name_ru ILIKE '%овощи и фрукт%');

-- 007 Vegetables
UPDATE categories SET mxik_group_code='007' WHERE mxik_group_code IS NULL AND (
  name_uz ILIKE '%sabzavot%' OR name_ru ILIKE '%овощ%');

-- Dried fruits (сухофрукты) intentionally LEFT NULL for manual admin assignment;
-- they are excluded from the 008 rule below so "орех"/"meva" does not auto-claim them.

-- 008 Fruits & nuts
UPDATE categories SET mxik_group_code='008' WHERE mxik_group_code IS NULL
  AND (name_uz ILIKE '%meva%' OR name_ru ILIKE '%фрукт%' OR name_uz ILIKE '%yong''oq%' OR name_ru ILIKE '%орех%')
  AND name_uz NOT ILIKE '%quruq meva%' AND name_uz NOT ILIKE '%qoqi meva%' AND name_ru NOT ILIKE '%сухофрукт%';

-- 009 Tea & coffee
UPDATE categories SET mxik_group_code='009' WHERE mxik_group_code IS NULL AND (
  name_uz ILIKE '%choy%' OR name_uz ILIKE '%qahva%' OR name_ru ILIKE '%кофе%' OR name_ru ILIKE '%чай%');

-- 009 Spices
UPDATE categories SET mxik_group_code='009' WHERE mxik_group_code IS NULL AND (
  name_uz ILIKE '%ziravor%' OR name_uz ILIKE '%bahor%' OR name_uz ILIKE '%speci%'
  OR name_ru ILIKE '%специ%' OR name_ru ILIKE '%приправ%');

-- 010 Grains / cereals
UPDATE categories SET mxik_group_code='010' WHERE mxik_group_code IS NULL AND (
  name_uz ILIKE '%don %' OR name_uz ILIKE '%donli%' OR name_ru ILIKE '%крупа%' OR name_ru ILIKE '%крупы%'
  OR name_uz ILIKE '%guruch%' OR name_uz ILIKE '%bug''doy%' OR name_uz ILIKE '%makkajo%');

-- 011 Flour products
UPDATE categories SET mxik_group_code='011' WHERE mxik_group_code IS NULL AND (
  name_uz ILIKE '%un %' OR name_ru ILIKE '%мука%' OR name_ru ILIKE '%тесто%' OR name_uz ILIKE '%xamir%');

-- 015 Oils & sauces
UPDATE categories SET mxik_group_code='015' WHERE mxik_group_code IS NULL AND (
  name_uz ILIKE '%yog''%' OR name_ru ILIKE '%масл%' OR name_uz ILIKE '%sous%' OR name_ru ILIKE '%соус%'
  OR name_uz ILIKE '%sirka%' OR name_ru ILIKE '%уксус%' OR name_uz ILIKE '%mayonez%' OR name_ru ILIKE '%майонез%'
  OR name_uz ILIKE '%ketchup%');

-- 016 Canned / preserved
UPDATE categories SET mxik_group_code='016' WHERE mxik_group_code IS NULL AND (
  name_uz ILIKE '%konserv%' OR name_ru ILIKE '%консерв%');

-- 017 Confectionery
UPDATE categories SET mxik_group_code='017' WHERE mxik_group_code IS NULL AND (
  name_uz ILIKE '%shakar%' OR name_ru ILIKE '%сахар%' OR name_uz ILIKE '%qandolat%' OR name_ru ILIKE '%кондитер%'
  OR name_uz ILIKE '%shokolad%' OR name_ru ILIKE '%шоколад%' OR name_uz ILIKE '%konfet%' OR name_ru ILIKE '%конфет%');

-- 018 Cocoa products
UPDATE categories SET mxik_group_code='018' WHERE mxik_group_code IS NULL AND (
  name_uz ILIKE '%kakao%' OR name_ru ILIKE '%какао%');

-- 019 Bread / bakery
UPDATE categories SET mxik_group_code='019' WHERE mxik_group_code IS NULL AND (
  name_uz ILIKE '%non %' OR name_ru ILIKE '%нон %' OR name_ru ILIKE '%хлеб%' OR name_uz ILIKE '%bulochk%'
  OR name_ru ILIKE '%булочк%' OR name_ru ILIKE '%выпечк%' OR name_uz ILIKE '%lipioshka%' OR name_uz ILIKE '%lavash%');

-- 022 Beverages
UPDATE categories SET mxik_group_code='022' WHERE mxik_group_code IS NULL AND (
  name_uz ILIKE '%ichimlik%' OR name_ru ILIKE '%напит%' OR name_uz ILIKE '%soda%' OR name_uz ILIKE '%sharbat%'
  OR name_ru ILIKE '%сок%' OR name_uz ILIKE '%salqin%' OR name_ru ILIKE '%минерал%');

-- 021 Baby / children food
UPDATE categories SET mxik_group_code='021' WHERE mxik_group_code IS NULL AND (
  name_uz ILIKE '%bolalar%' OR name_ru ILIKE '%детск%' OR name_uz ILIKE '%baby%' OR name_ru ILIKE '%смесь%'
  OR name_uz ILIKE '%aralashma%');

-- 021 Misc food
UPDATE categories SET mxik_group_code='021' WHERE mxik_group_code IS NULL AND (
  name_uz ILIKE '%oziq%' OR name_ru ILIKE '%продукт%' OR name_uz ILIKE '%turli%' OR name_ru ILIKE '%разн%');

-- ── Non-food groups ─────────────────────────────────────────────────────────
-- 033 Cosmetics & hygiene
UPDATE categories SET mxik_group_code='033' WHERE mxik_group_code IS NULL AND (
  name_uz ILIKE '%kosmetik%' OR name_ru ILIKE '%косметик%' OR name_uz ILIKE '%parfum%' OR name_ru ILIKE '%парфюм%'
  OR name_uz ILIKE '%gigiena%' OR name_ru ILIKE '%гигиен%' OR name_uz ILIKE '%deo%' OR name_ru ILIKE '%дезодор%');

-- 034 Soap, detergents & household goods
UPDATE categories SET mxik_group_code='034' WHERE mxik_group_code IS NULL AND (
  name_uz ILIKE '%sovun%' OR name_ru ILIKE '%мыл%' OR name_uz ILIKE '%yuvish%' OR name_ru ILIKE '%моющ%'
  OR name_uz ILIKE '%tozalash%' OR name_ru ILIKE '%чистящ%' OR name_uz ILIKE '%detergent%'
  OR name_uz ILIKE '%uy-ro''zg''or%' OR name_ru ILIKE '%бытов%' OR name_uz ILIKE '%xo''jalik%'
  OR name_ru ILIKE '%хозяйств%' OR name_uz ILIKE '%ro''zg''or%');

-- 048 Paper products
UPDATE categories SET mxik_group_code='048' WHERE mxik_group_code IS NULL AND (
  name_uz ILIKE '%qog''oz%' OR name_ru ILIKE '%бумаг%' OR name_uz ILIKE '%salfetka%' OR name_ru ILIKE '%салфетк%');

-- 049 Stationery
UPDATE categories SET mxik_group_code='049' WHERE mxik_group_code IS NULL AND (
  name_uz ILIKE '%kanstovar%' OR name_ru ILIKE '%канцтовар%' OR name_uz ILIKE '%qalam%' OR name_ru ILIKE '%ручк%'
  OR name_uz ILIKE '%daftar%' OR name_ru ILIKE '%тетрад%');

-- 061 Clothing
UPDATE categories SET mxik_group_code='061' WHERE mxik_group_code IS NULL AND (
  name_uz ILIKE '%kiyim%' OR name_ru ILIKE '%одежд%' OR name_uz ILIKE '%palto%' OR name_ru ILIKE '%пальто%'
  OR name_uz ILIKE '%forma%');

-- 064 Footwear
UPDATE categories SET mxik_group_code='064' WHERE mxik_group_code IS NULL AND (
  name_uz ILIKE '%poyabzal%' OR name_ru ILIKE '%обувь%' OR name_ru ILIKE '%туфл%' OR name_ru ILIKE '%ботинк%');

-- 095 Toys
UPDATE categories SET mxik_group_code='095' WHERE mxik_group_code IS NULL AND (
  name_uz ILIKE '%o''yinchoq%' OR name_ru ILIKE '%игрушк%');

-- ── Result: every category + assigned code; NULL rows still need manual mapping ─
SELECT id, store_id, name_uz, name_ru, mxik_group_code
FROM categories
ORDER BY (mxik_group_code IS NULL) DESC, store_id, mxik_group_code, id;

COMMIT;   -- change to ROLLBACK for a dry run
