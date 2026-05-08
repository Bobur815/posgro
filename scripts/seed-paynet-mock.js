#!/usr/bin/env node
/**
 * Inserts mock PaynetReceipt rows into the VPS PostgreSQL DB for testing.
 * Usage:  node scripts/seed-paynet-mock.js [storeId]
 * If storeId is omitted, uses the first store found in the DB.
 *
 * Requires DATABASE_URL in .env pointing to the VPS Postgres.
 */

require('dotenv').config({ path: '.env' });
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const MOCK_RECEIPTS = [
  { receiptNumber: 'MOCK001', amount: 25000,  fiscalMark: 'MOCK_S_001', terminalCode: 'MOCK_T' },
  { receiptNumber: 'MOCK002', amount: 50000,  fiscalMark: 'MOCK_S_002', terminalCode: 'MOCK_T' },
  { receiptNumber: 'MOCK003', amount: 120000, fiscalMark: 'MOCK_S_003', terminalCode: 'MOCK_T' },
];

async function main() {
  const argStoreId = process.argv[2];

  let storeId = argStoreId;
  if (!storeId) {
    const store = await prisma.store.findFirst({ orderBy: { createdAt: 'asc' } });
    if (!store) throw new Error('No stores found in DB. Pass storeId as argument.');
    storeId = store.id;
    console.log(`Using store: "${store.name}" (${storeId})`);
  }

  for (const mock of MOCK_RECEIPTS) {
    const ofdUrl = `https://ofd.soliq.uz/epi?t=${mock.terminalCode}&r=${mock.receiptNumber}&c=20260508120000&s=${mock.fiscalMark}`;
    await prisma.paynetReceipt.upsert({
      where: { storeId_receiptNumber: { storeId, receiptNumber: mock.receiptNumber } },
      create: {
        storeId,
        ofdUrl,
        receiptNumber: mock.receiptNumber,
        terminalCode: mock.terminalCode,
        fiscalMark: mock.fiscalMark,
        issuedAt: new Date(),
        amount: mock.amount,
        integrated: false,
      },
      update: { amount: mock.amount, integrated: false, integratedAt: null, saleReceiptNumber: null },
    });
    console.log(`  ✓ #${mock.receiptNumber}  ${mock.amount.toLocaleString()} so'm`);
  }

  console.log('\nDone. Open SalesHistoryModal → click Print on a sale with matching amount to test.');
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
