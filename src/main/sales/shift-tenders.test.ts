import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

// Real SQLite through the real schema setup: the UNION is the thing under test, and a mocked
// query would only prove the mock.
jest.setTimeout(30_000);

const dataDir = mkdtempSync(join(tmpdir(), 'posgro-shift-tenders-'));
jest.mock('electron', () => ({
  app: {
    getPath: () => dataDir,
    getAppPath: () => join(__dirname, '..', '..', '..'),
    isPackaged: false,
  },
}));

import { closeDatabase, getPrismaClient, initializeDatabase } from '../database/sqlite-client';
import { shiftTenderRows } from './shift-tenders';

const db = () => getPrismaClient();

async function sale(id: string, method: string, paid: number, discount = 0, smena = 'S1') {
  await db().$executeRawUnsafe(
    `INSERT INTO sales (id, receipt_number, total_amount, discount_amount, final_amount, paid_amount,
                        payment_method, cashier_id, cashier_name, terminal_id, smena_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'c1', 'Cashier', 'T1', ?)`,
    id,
    `R-${id}`,
    paid + discount,
    discount,
    paid,
    paid,
    method,
    smena,
  );
}

async function line(saleId: string, method: string, amount: number) {
  await db().$executeRawUnsafe(
    `INSERT INTO sale_payments (id, sale_id, method, amount) VALUES (?, ?, ?, ?)`,
    `${saleId}-${method}`,
    saleId,
    method,
    amount,
  );
}

beforeAll(async () => {
  await initializeDatabase();
  await sale('a', 'cash', 30000);
  await sale('b', 'card', 20000);
  // The user story: 100 000 = 55 000 cash + 45 000 card, with a 1 000 discount on the receipt.
  await sale('c', 'mixed', 100000, 1000);
  await line('c', 'cash', 55000);
  await line('c', 'card', 45000);
  await sale('d', 'mixed', 50000);
  await line('d', 'cash', 10000);
  await line('d', 'click', 40000);
  // Another shift: never counted.
  await sale('e', 'mixed', 99000, 0, 'S2');
  await line('e', 'cash', 99000);
});

afterAll(async () => {
  await closeDatabase();
});

describe('shiftTenderRows', () => {
  it('breaks split receipts into their lines, so the drawer sees only their cash', async () => {
    const split = (await shiftTenderRows('S1')).filter((x) => x.discounts === 0 && x.cnt > 0);
    const cashLines = split
      .filter((x) => x.payment_method === 'cash')
      .reduce((s, x) => s + x.total, 0);
    const cardLines = split
      .filter((x) => x.payment_method === 'card')
      .reduce((s, x) => s + x.total, 0);
    expect(cashLines).toBe(30000 + 55000 + 10000);
    expect(cardLines).toBe(20000 + 45000);
  });

  it('counts a split receipt once in each tender it used, and its discount once', async () => {
    const rows = await shiftTenderRows('S1');
    const sum = (m: string, k: 'cnt' | 'total' | 'discounts') =>
      rows.filter((x) => x.payment_method === m).reduce((s, x) => s + x[k], 0);
    expect(sum('cash', 'cnt')).toBe(3); // a, c, d
    expect(sum('click', 'total')).toBe(40000);
    expect(sum('mixed', 'total')).toBe(0);
    expect(sum('mixed', 'discounts')).toBe(1000);
    // All money in the shift, every tender together, equals the receipts' paid amounts.
    const money = rows.reduce((s, x) => s + x.total, 0);
    expect(money).toBe(30000 + 20000 + 100000 + 50000);
  });
});
