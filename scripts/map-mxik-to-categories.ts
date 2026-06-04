#!/usr/bin/env node
/**
 * Maps existing store categories to MXIK group codes by matching category names.
 * Does NOT create new categories — only updates mxik_group_code on existing ones.
 *
 * Usage:
 *   DATABASE_URL="postgresql://postgres:PASS@localhost:5434/posgro_staging" \
 *     npx tsx scripts/map-mxik-to-categories.ts [--dry-run]
 */

import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const dryRun  = process.argv.includes('--dry-run');
const remap   = process.argv.includes('--remap');  // re-map already-set categories

// ─── Mapping: keyword patterns (lowercase) → MXIK group code ─────────────────
// Pattern is matched against lowercase nameUz or nameRu of the category.
// First matching rule wins.
const RULES: Array<{ keywords: string[]; groupCode: string; note: string }> = [
  // Food groups
  { keywords: ['go\'sht', 'мяс', 'kolbas', 'колбас'],          groupCode: '002', note: 'Meat products' },
  { keywords: ['baliq', 'рыб', 'dengiz'],                       groupCode: '003', note: 'Fish / seafood' },
  { keywords: ['sut', 'молоч', 'qatiq', 'kefir', 'tvorog',
               'творог', 'сыр', 'pishloq'],                     groupCode: '004', note: 'Dairy' },
  { keywords: ['tuxum', 'яйц'],                                 groupCode: '004', note: 'Eggs (animal products)' },
  { keywords: ['muzqaymoq', 'мороженое'],                       groupCode: '004', note: 'Ice cream (dairy)' },
  // "Meva va sabzavotlar" / "Фрукты и овощи" — combined category spanning
  // MXIK 007 (vegetables) AND 008 (fruits). Must come before the separate rules.
  { keywords: ['meva va sabzavot', 'фрукты и овощ', 'овощи и фрукт'],
                                                                groupCode: '007,008', note: 'Fruits & vegetables (combined)' },
  { keywords: ['sabzavot', 'овощ'],                             groupCode: '007', note: 'Vegetables' },
  // "Quruq mevalar" / "Сухофрукты" — dried fruits are a subset of MXIK 008
  // (same group as fresh fruits). Use null so fresh fruits auto-select the
  // broader "Meva va sabzavotlar" category instead. Admin sets this manually.
  { keywords: ['quruq meva', 'сухофрукт', 'qoqi meva'],        groupCode: 'null', note: 'Dried fruits (no auto-map)' },
  { keywords: ['meva', 'фрукт', 'yong\'oq', 'орех'],           groupCode: '008', note: 'Fruits & nuts' },
  { keywords: ['choy', 'qahva', 'кофе', 'чай'],                groupCode: '009', note: 'Tea & coffee' },
  { keywords: ['ziravor', 'bahor', 'speci', 'специ', 'приправ'], groupCode: '009', note: 'Spices' },
  { keywords: ['don ', 'donli', 'крупа', 'крупы', 'guruch',
               'buğdoy', 'makkajo\'xori'],                      groupCode: '010', note: 'Grains / cereals' },
  { keywords: ['un ', 'мука', 'тесто', 'xamir'],               groupCode: '011', note: 'Flour products' },
  { keywords: ['yog\'', 'масл', 'sous', 'соус', 'sirka',
               'уксус', 'mayonez', 'майонез', 'ketchup'],      groupCode: '015', note: 'Oils & sauces' },
  { keywords: ['konserv', 'консерв'],                           groupCode: '016', note: 'Canned / preserved' },
  { keywords: ['shakar', 'сахар', 'qandolat', 'кондитер',
               'shokolad', 'шоколад', 'konfet', 'конфет'],     groupCode: '017', note: 'Confectionery' },
  { keywords: ['kakao', 'какао'],                               groupCode: '018', note: 'Cocoa products' },
  { keywords: ['non ', 'нон ', 'хлеб', 'bulochk', 'булочк',
               'выпечк', 'lipioshka', 'lavash'],                groupCode: '019', note: 'Bread / bakery' },
  { keywords: ['ichimlik', 'напит', 'soda', 'juices', 'sharbat',
               'сок', 'salqin', 'минерал'],                    groupCode: '022', note: 'Beverages' },
  { keywords: ['bolalar', 'детск', 'baby', 'смесь', 'aralashma'], groupCode: '021', note: 'Baby / children food' },
  { keywords: ['oziq', 'продукт', 'turli', 'разн'],            groupCode: '021', note: 'Misc food' },

  // Non-food groups
  { keywords: ['kosmetik', 'косметик', 'parfum', 'парфюм',
               'gigiena', 'гигиен', 'deo', 'дезодор'],        groupCode: '033', note: 'Cosmetics & hygiene' },
  { keywords: ['sovun', 'мыл', 'yuvish', 'моющ', 'tozalash',
               'чистящ', 'detergent'],                         groupCode: '034', note: 'Soap & detergents' },
  { keywords: ['uy-ro\'zg\'or', 'бытов', 'xo\'jalik',
               'хозяйств', 'ro\'zg\'or'],                      groupCode: '034', note: 'Household goods' },
  { keywords: ['qog\'oz', 'бумаг', 'salfetka', 'салфетк'],    groupCode: '048', note: 'Paper products' },
  { keywords: ['kanstovar', 'канцтовар', 'qalam', 'ручк',
               'daftar', 'тетрад'],                            groupCode: '049', note: 'Stationery' },
  { keywords: ['kiyim', 'одежд', 'palto', 'пальто', 'forma'],  groupCode: '061', note: 'Clothing' },
  { keywords: ['poyabzal', 'обувь', 'туфл', 'ботинк'],        groupCode: '064', note: 'Footwear' },
  { keywords: ['o\'yinchoq', 'игрушк', 'toy'],                groupCode: '095', note: 'Toys' },
];

// Returns:
//   string  — matched group code (may be comma-separated, e.g. "007,008")
//   null    — matched but explicitly no group (dried fruits etc.)
//   undefined — no match at all
function findGroupCode(nameUz: string, nameRu: string): string | null | undefined {
  const haystack = `${nameUz} ${nameRu}`.toLowerCase();
  for (const rule of RULES) {
    if (rule.keywords.some((kw) => haystack.includes(kw))) {
      return rule.groupCode === 'null' ? null : rule.groupCode;
    }
  }
  return undefined;
}

async function main() {
  const categories = await prisma.category.findMany({
    select: { id: true, storeId: true, nameUz: true, nameRu: true, mxikGroupCode: true },
    orderBy: { id: 'asc' },
  });

  console.log(`Total categories: ${categories.length}`);
  if (dryRun) console.log('DRY RUN — no changes will be written\n');

  let mapped = 0;
  let alreadySet = 0;
  let unmatched: typeof categories = [];

  for (const cat of categories) {
    if (!remap && cat.mxikGroupCode !== null && cat.mxikGroupCode !== undefined) { alreadySet++; continue; }

    const groupCode = findGroupCode(cat.nameUz, cat.nameRu);
    if (groupCode === undefined) {
      unmatched.push(cat);
      continue;
    }

    // groupCode is either a string (including comma-separated) or null (explicit no-map)
    const displayCode = groupCode ?? 'null (no auto-map)';
    const rule = RULES.find((r) =>
      r.keywords.some((kw) => `${cat.nameUz} ${cat.nameRu}`.toLowerCase().includes(kw)));

    console.log(`  [${cat.id}] "${cat.nameUz}" → ${displayCode} (${rule?.note})`);

    if (!dryRun) {
      await prisma.category.update({ where: { id: cat.id }, data: { mxikGroupCode: groupCode } });
    }
    mapped++;
  }

  if (unmatched.length > 0) {
    console.log('\nUnmatched (no group code found):');
    unmatched.forEach((c) => console.log(`  [${c.id}] "${c.nameUz}" / "${c.nameRu}"`));
  }

  console.log(`\nDone.`);
  console.log(`  Mapped      : ${mapped}`);
  console.log(`  Already set : ${alreadySet}`);
  console.log(`  Unmatched   : ${unmatched.length}`);

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  prisma.$disconnect().finally(() => process.exit(1));
});
