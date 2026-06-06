#!/usr/bin/env node
/**
 * Imports the official tasnif.soliq.uz Excel catalog into the mxik_catalog table.
 * Filters out categories not permitted under the store's legal retail activity.
 *
 * Setup:
 *   1. Open SSH tunnel to Contabo (use port 5433 to avoid local postgres conflict):
 *        ssh -L 5433:localhost:5432 contabo
 *
 *   2. Run against staging first:
 *        DATABASE_URL="postgresql://postgres:PASS@localhost:5433/posgro_staging" \
 *          npx tsx scripts/import-mxik-catalog.ts [path/to/catalog-excel.xlsx]
 *
 *   3. After verifying staging, run against production (posgro).
 *
 * Default Excel path: ~/Downloads/catalog-excel.xlsx
 */

import 'dotenv/config';
import { PrismaClient, Prisma } from '@prisma/client';
import * as XLSX from 'xlsx';
import * as path from 'path';
import * as os from 'os';

const prisma = new PrismaClient();

// ─── Legal exclusions ──────────────────────────────────────────────────────────
// Store may NOT sell: alcohol, tobacco, petroleum, pharmaceuticals, cement/shifer,
// wood products, precious metals/jewelry, new imported cars.
// MXIK group code = first 3 digits (mirrors HS chapter numbers).

const EXCLUDED_GROUP_CODES = new Set([
  '024', // Tobacco and manufactured tobacco substitutes
  '025', // Salt, cement, asbestos, slate (shifer), construction aggregates
  '027', // Mineral fuels, oils, petroleum products
  '030', // Pharmaceutical products
  '044', // Wood and articles of wood, wood charcoal
  '071', // Precious stones, metals, jewelry
  '087', // Vehicles, new imported cars
]);

// Partial exclusions within otherwise-allowed groups
const EXCLUDED_CLASS_CODES = new Set([
  '02208', // Alcoholic beverages (ethyl alcohol, spirits, wine, beer)
]);

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Parse "03304020-Antiseptiklar" → { code: "03304020", name: "Antiseptiklar" } */
function parseCodeName(raw: unknown): { code: string; name: string } | null {
  const str = String(raw ?? '').trim();
  if (!str) return null;
  // Leading digits followed by dash or space (handles "03304999087000 ---" too)
  const m = str.match(/^(\d+)[\s-]+(.*)/);
  if (m) {
    const name = m[2].trim().replace(/^[-\s]+$/, ''); // collapse "---" or "- -" → ""
    return { code: m[1], name };
  }
  if (/^\d+$/.test(str)) return { code: str, name: '' };
  return null;
}

function cell(row: unknown[], idx: number): string {
  return String((row as unknown[])[idx] ?? '').trim();
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const filePath =
    process.argv[2] ?? path.join(os.homedir(), 'Downloads', 'catalog-excel.xlsx');

  console.log('Reading:', filePath);
  const wb = XLSX.readFile(filePath, { dense: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  // Row 0 = main headers, Row 1 = sub-headers; data starts at row 2
  const allRows: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  const dataRows = allRows.slice(2);
  console.log(`Total data rows: ${dataRows.length}`);

  const BATCH_SIZE = 500;
  let inserted = 0;
  let filtered = 0; // excluded by legal category
  let skipped = 0;  // invalid/empty rows
  let batch: Prisma.MxikCatalogCreateManyInput[] = [];

  async function flush() {
    if (batch.length === 0) return;
    const r = await prisma.mxikCatalog.createMany({ data: batch, skipDuplicates: true });
    inserted += r.count;
    batch = [];
  }

  for (let i = 0; i < dataRows.length; i++) {
    const row = dataRows[i];

    // Col 6: MXIK KODI — must be exactly 17 digits
    const mxikCode = cell(row, 6);
    if (!mxikCode || !/^\d{17}$/.test(mxikCode)) { skipped++; continue; }

    // Col 0: GURUH NOMI → groupCode (first 3 digits)
    const groupParsed = parseCodeName(cell(row, 0));
    if (!groupParsed) { skipped++; continue; }
    const groupCode = groupParsed.code.slice(0, 3);
    if (EXCLUDED_GROUP_CODES.has(groupCode)) { filtered++; continue; }

    // Col 1: SINF NOMI → classCode (5 digits)
    const classParsed = parseCodeName(cell(row, 1));
    if (!classParsed) { skipped++; continue; }
    if (EXCLUDED_CLASS_CODES.has(classParsed.code)) { filtered++; continue; }

    // Col 2: POZITSIYA NOMI, Col 3: SUBPOZITSIYA NOMI
    const position = parseCodeName(cell(row, 2));
    const subPos   = parseCodeName(cell(row, 3));
    if (!position || !subPos) { skipped++; continue; }

    // Col 4: BREND NOMI — null when "03304999087000 ---" (no brand)
    const brandParsed = parseCodeName(cell(row, 4));
    const hasBrand = brandParsed?.name && brandParsed.name.length > 0;

    // Col 5: ATRIBUT NOMI — null when "---"
    const attrRaw = cell(row, 5);
    const attributeName = !attrRaw || /^-+$/.test(attrRaw) ? null : attrRaw;

    // Col 7: MXIK NOMI, Col 8: SHTRIX KODI (barcode), Col 9: unit
    const mxikName        = cell(row, 7) || mxikCode;
    const internationalCode = cell(row, 8) || null;
    const unitName        = cell(row, 9) || null;

    batch.push({
      mxikCode,
      mxikName,
      groupCode,
      groupName:        groupParsed.name,
      classCode:        classParsed.code,
      className:        classParsed.name,
      positionCode:     position.code,
      positionName:     position.name,
      subPositionCode:  subPos.code,
      subPositionName:  subPos.name,
      brandCode:        hasBrand ? brandParsed!.code : null,
      brandName:        hasBrand ? brandParsed!.name : null,
      attributeName,
      internationalCode,
      unitName,
      commonUnitName:   null,
    });

    if (batch.length >= BATCH_SIZE) {
      await flush();
      process.stdout.write(
        `\r  inserted: ${inserted.toLocaleString()} | filtered: ${filtered.toLocaleString()} | skipped: ${skipped.toLocaleString()} | row: ${(i + 1).toLocaleString()}/${dataRows.length.toLocaleString()}`,
      );
    }
  }

  await flush();

  console.log('\n');
  console.log(`  Inserted : ${inserted.toLocaleString()}`);
  console.log(`  Filtered : ${filtered.toLocaleString()}  (excluded legal categories)`);
  console.log(`  Skipped  : ${skipped.toLocaleString()}   (invalid/empty rows)`);
  console.log(`  Total    : ${dataRows.length.toLocaleString()}`);
  console.log('\nDone.');

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  prisma.$disconnect().finally(() => process.exit(1));
});
