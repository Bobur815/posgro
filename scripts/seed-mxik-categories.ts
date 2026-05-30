#!/usr/bin/env node
/**
 * Creates Category rows per store from MXIK group-level data in mxik_catalog.
 * One category per (store × MXIK group). Skips groups that already have a
 * matching category (idempotent — safe to re-run).
 *
 * Usage:
 *   DATABASE_URL="postgresql://postgres:PASS@localhost:5434/posgro_staging" \
 *     npx tsx scripts/seed-mxik-categories.ts [--storeId=<id>] [--all]
 *
 * Flags:
 *   --storeId=<id>  Only create categories for this store (default: all stores)
 *   --all           Include service groups (100+); default: goods only (001-099)
 */

import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const args = process.argv.slice(2);
const targetStoreId = args.find((a) => a.startsWith('--storeId='))?.split('=')[1];
const includeServices = args.includes('--all');

async function main() {
  // ── 1. Get distinct groups from catalog, pick the name with most rows ────────
  const rawGroups = await prisma.mxikCatalog.groupBy({
    by: ['groupCode', 'groupName'],
    _count: { mxikCode: true },
    orderBy: { groupCode: 'asc' },
  });

  // Deduplicate by groupCode: keep the name variant with the highest row count
  const groupMap = new Map<string, { groupName: string; count: number }>();
  for (const g of rawGroups) {
    const existing = groupMap.get(g.groupCode);
    if (!existing || g._count.mxikCode > existing.count) {
      groupMap.set(g.groupCode, { groupName: g.groupName, count: g._count.mxikCode });
    }
  }

  // Filter: goods only (001-099) unless --all
  const groups = [...groupMap.entries()]
    .filter(([code]) => includeServices || parseInt(code, 10) <= 99)
    .map(([groupCode, { groupName }]) => ({ groupCode, groupName }));

  console.log(`Groups to seed: ${groups.length} (${includeServices ? 'including services' : 'goods only, 001-099'})`);

  // ── 2. Get target stores ─────────────────────────────────────────────────────
  const stores = await prisma.store.findMany({
    where: {
      active: true,
      ...(targetStoreId ? { id: targetStoreId } : {}),
    },
    select: { id: true, name: true },
  });

  if (stores.length === 0) {
    console.error('No active stores found.');
    process.exit(1);
  }
  console.log(`Stores: ${stores.map((s) => `${s.name} (${s.id})`).join(', ')}\n`);

  // ── 3. Seed categories ───────────────────────────────────────────────────────
  let created = 0;
  let skipped = 0;

  for (const store of stores) {
    // Load existing categories for this store that already have a mxikGroupCode
    const existing = await prisma.category.findMany({
      where: { storeId: store.id, mxikGroupCode: { not: null } },
      select: { mxikGroupCode: true },
    });
    const existingCodes = new Set(existing.map((c) => c.mxikGroupCode!));

    const toCreate = groups.filter((g) => !existingCodes.has(g.groupCode));
    skipped += groups.length - toCreate.length;

    if (toCreate.length === 0) {
      console.log(`  [${store.name}] all ${groups.length} categories already exist — skipped`);
      continue;
    }

    await prisma.category.createMany({
      data: toCreate.map((g) => ({
        storeId:      store.id,
        nameUz:       g.groupName,
        nameRu:       g.groupName, // Catalog is Uzbek-only; admin can update Russian names
        mxikGroupCode: g.groupCode,
        active:       true,
      })),
    });

    created += toCreate.length;
    console.log(`  [${store.name}] created ${toCreate.length} categories, skipped ${groups.length - toCreate.length} existing`);
  }

  console.log(`\nDone.`);
  console.log(`  Created : ${created}`);
  console.log(`  Skipped : ${skipped}  (already existed)`);

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  prisma.$disconnect().finally(() => process.exit(1));
});
