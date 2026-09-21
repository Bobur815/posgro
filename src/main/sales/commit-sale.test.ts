import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

/**
 * The commit path against a real SQLite database.
 *
 * What matters here cannot be shown with mocks: that two requests for the last unit cannot both
 * succeed, that a failed edit leaves stock exactly as it was, and that a retried commit does not
 * sell twice. Each is a property of real queries under real concurrency.
 */

const dataDir = mkdtempSync(join(tmpdir(), 'posgro-commit-sale-'));

// Real SQLite, bcrypt and (for some) a real HTTP server, on a machine running every other suite at
// once: a cold full run has pushed single steps past Jest's 5s default and cascaded into unrelated
// failures. A generous ceiling only changes how long a genuinely hung test takes to fail.
jest.setTimeout(30_000);

jest.mock('electron', () => ({
  app: {
    getPath: () => dataDir,
    getAppPath: () => join(__dirname, '..', '..', '..'),
  },
}));

import { initializeDatabase, closeDatabase, getPrismaClient } from '../database/sqlite-client';
import {
  __forgetUnsettled,
  commitSale,
  deleteSale,
  drainSaleWrites,
  markSettled,
  updateSale,
  type SaleInput,
} from './commit-sale';
import { freezeWrites, thawWrites } from './write-freeze';

const MAIN = { terminalId: 'T1', cashierId: 'user-1', cashierName: 'Кассир' };
const SATELLITE = { terminalId: 'T2', cashierId: 'user-1', cashierName: 'Кассир' };
const ADMIN = { userId: 'user-1', phone: '+998900000001', role: 'ADMIN' };

let categoryId = 0;
let nextBarcode = 4780000000100;

async function product(stock: number, extra: Record<string, unknown> = {}) {
  return getPrismaClient().product.create({
    data: {
      barcode: String(nextBarcode++),
      nameRu: 'Товар',
      nameUz: 'Tovar',
      price: 1000,
      stock,
      categoryId,
      ...extra,
    },
  });
}

function line(p: { id: number; barcode: string }, quantity = 1, piecesPerUnit = 1) {
  return {
    productId: p.id,
    productName: 'Товар',
    barcode: p.barcode,
    quantity,
    unitPrice: 1000,
    piecesPerUnit,
  };
}

function cart(...items: ReturnType<typeof line>[]): SaleInput {
  return { items, paymentMethod: 'cash' };
}

async function stockOf(id: number): Promise<number> {
  const row = await getPrismaClient().product.findUnique({ where: { id } });
  return Number(row.stock);
}

/** The refusal code a rejected commit carried, dug out the way the renderer does it. */
function codeOf(reason: unknown): string | undefined {
  const message = reason instanceof Error ? reason.message : String(reason);
  try {
    return JSON.parse(message.slice(message.indexOf('{'))).code;
  } catch {
    return undefined;
  }
}

beforeAll(async () => {
  await initializeDatabase();
  const prisma = getPrismaClient();
  categoryId = (await prisma.category.create({ data: { nameRu: 'К', nameUz: 'K' } })).id;
  for (const t of [MAIN, SATELLITE]) {
    await prisma.smena.create({
      data: {
        terminalId: t.terminalId,
        cashierId: t.cashierId,
        cashierName: t.cashierName,
        initialCash: 0,
        zReportNumber: 1,
      },
    });
  }
}, 120_000);

afterAll(async () => {
  await closeDatabase();
  rmSync(dataDir, { recursive: true, force: true });
});

describe('commitSale', () => {
  it('writes the sale, decrements stock, and reports the stock left', async () => {
    const p = await product(5);
    const { sale, stock, replayed } = await commitSale(cart(line(p, 2)), MAIN);

    expect(replayed).toBe(false);
    expect(sale.receiptNumber).toMatch(/^T1\d{6}\d{3}$/);
    expect(sale.items).toHaveLength(1);
    expect(await stockOf(p.id)).toBe(3);
    expect(stock).toEqual([{ productId: p.id, barcode: p.barcode, stock: 3, price: 1000 }]);
  });

  /**
   * §3 of the plan, in one process. Ten tills — or ten requests from satellites — want the last
   * three units at once. Exactly three may have them.
   */
  it('lets exactly as many sales through as there is stock, under concurrency', async () => {
    const p = await product(3);
    const results = await Promise.allSettled(
      Array.from({ length: 10 }, () => commitSale(cart(line(p)), MAIN)),
    );

    const ok = results.filter((r): r is PromiseFulfilledResult<any> => r.status === 'fulfilled');
    const refused = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');

    expect(ok).toHaveLength(3);
    // Every refusal is the stock check speaking — not a lock timeout or a crash.
    expect(refused.map((r) => codeOf(r.reason))).toEqual(Array(7).fill('INSUFFICIENT_STOCK'));
    expect(await stockOf(p.id)).toBe(0);

    const receipts = ok.map((r) => r.value.sale.receiptNumber);
    expect(new Set(receipts).size).toBe(3);
  });

  it('checks the whole receipt against stock, not each line alone', async () => {
    // Six pieces on the shelf: a box of 4 and 3 loose pieces fit line by line, but not together.
    const p = await product(6, { piecesPerBox: 4 });
    const attempt = commitSale(cart(line(p, 1, 4), line(p, 3)), MAIN);

    await expect(attempt).rejects.toThrow(/INSUFFICIENT_STOCK/);
    expect(await stockOf(p.id)).toBe(6);
  });

  it('files a satellite’s sale under its own shift and receipt prefix', async () => {
    const p = await product(5);
    const { sale } = await commitSale(cart(line(p)), SATELLITE);

    const smena = await getPrismaClient().smena.findFirst({ where: { terminalId: 'T2' } });
    expect(sale.terminalId).toBe('T2');
    expect(sale.smenaId).toBe(smena.id);
    expect(sale.receiptNumber.startsWith('T2')).toBe(true);
  });

  it('refuses a till with no open shift', async () => {
    const p = await product(5);
    const attempt = commitSale(cart(line(p)), { ...MAIN, terminalId: 'T7' });
    await expect(attempt).rejects.toThrow(/NO_SMENA_OPEN/);
    expect(await stockOf(p.id)).toBe(5);
  });

  describe('a retried commit', () => {
    it('returns the sale already made, and sells nothing twice', async () => {
      const p = await product(5);
      const input = { ...cart(line(p, 2)), id: 'sale-retry-1' };

      const first = await commitSale(input, SATELLITE);
      const second = await commitSale(input, SATELLITE);

      expect(second.replayed).toBe(true);
      expect(second.sale.receiptNumber).toBe(first.sale.receiptNumber);
      expect(await stockOf(p.id)).toBe(3);
      expect(await getPrismaClient().sale.count({ where: { id: 'sale-retry-1' } })).toBe(1);
    });

    it('is refused when the id belongs to another till', async () => {
      const p = await product(5);
      await commitSale({ ...cart(line(p)), id: 'sale-retry-2' }, SATELLITE);

      const attempt = commitSale({ ...cart(line(p)), id: 'sale-retry-2' }, MAIN);
      await expect(attempt).rejects.toThrow(/SALE_ID_CONFLICT/);
    });
  });

  it('applies a pending price once stock falls to its threshold', async () => {
    const p = await product(5, { pendingPrice: 1500, pendingPriceThreshold: 3 });
    const { stock } = await commitSale(cart(line(p, 2)), MAIN);
    expect(stock[0].price).toBe(1500);
  });
});

describe('updateSale', () => {
  /**
   * The edit used to put the old lines back on the shelf and *then* check the new ones — so a
   * refused edit left that stock restored for good, and the shelf showed goods that had been sold.
   */
  it('leaves stock untouched when the new lines do not fit', async () => {
    const p = await product(4);
    const { sale } = await commitSale(cart(line(p, 2)), MAIN);
    expect(await stockOf(p.id)).toBe(2);

    const attempt = updateSale(sale.id, cart(line(p, 10)), ADMIN);
    await expect(attempt).rejects.toThrow(/INSUFFICIENT_STOCK/);
    expect(await stockOf(p.id)).toBe(2);
  });

  it('moves stock by the difference when it succeeds', async () => {
    const p = await product(4);
    const { sale } = await commitSale(cart(line(p, 1)), MAIN);
    await updateSale(sale.id, cart(line(p, 3)), ADMIN);
    expect(await stockOf(p.id)).toBe(1);
  });
});

describe('deleteSale', () => {
  it('puts every piece back, box lines included, and records the return', async () => {
    const p = await product(10, { piecesPerBox: 4 });
    const { sale } = await commitSale(cart(line(p, 1, 4), line(p, 2)), MAIN);
    expect(await stockOf(p.id)).toBe(4);

    await deleteSale(sale.id, ADMIN);
    expect(await stockOf(p.id)).toBe(10);

    const logged = await getPrismaClient().$queryRawUnsafe(
      `SELECT details FROM audit_logs WHERE entity_id = ?`,
      sale.id,
    );
    expect(JSON.parse((logged as any[])[0].details)).toMatchObject({ smenaId: sale.smenaId });
  });

  it('lets a satellite remove only the sales it rang up', async () => {
    const p = await product(5);
    const { sale } = await commitSale(cart(line(p)), MAIN);

    const attempt = deleteSale(sale.id, { ...ADMIN, terminalId: 'T2' });
    await expect(attempt).rejects.toThrow('Unauthorized');
    expect(await stockOf(p.id)).toBe(4);
  });
});

/**
 * What a main handing its role over waits for before its database is copied (§11.4): not only the
 * queue, but the settling of sales the queue has let through — whose fiscal status and marking
 * labels are written after the commit's turn is over.
 */
describe('drainSaleWrites', () => {
  // The commits above were never settled — nothing in this file plays the IPC handler.
  beforeAll(() => __forgetUnsettled());

  it('waits for a committed sale to be settled, and no longer', async () => {
    const p = await product(5);
    const { sale } = await commitSale(cart(line(p)), MAIN);

    let drainedAt = 0;
    const drain = drainSaleWrites(5_000).then(() => {
      drainedAt = Date.now();
    });
    await new Promise((r) => setTimeout(r, 200));
    expect(drainedAt).toBe(0);

    const settledAt = Date.now();
    markSettled(sale.id);
    await drain;
    // Well inside the 5 s deadline: it was the settle that let it go, not the clock.
    expect(drainedAt - settledAt).toBeLessThan(1_000);
  });

  it('refuses a commit while writes are frozen, and takes it again once thawed', async () => {
    const p = await product(5);
    freezeWrites(60_000);
    try {
      expect(codeOf(await commitSale(cart(line(p)), MAIN).catch((e) => e))).toBe('MAIN_HANDING_OFF');
      expect(await stockOf(p.id)).toBe(5);
    } finally {
      thawWrites();
    }
    const { sale } = await commitSale(cart(line(p)), MAIN);
    markSettled(sale.id);
    expect(await stockOf(p.id)).toBe(4);
  });
});

/**
 * Nasiya at the commit boundary.
 *
 * The split is computed in the main process, never taken from the renderer: `paidAmount` feeds
 * every drawer and shift figure there is, so a receipt that could write its own would be a way
 * to make money appear in a till that never held it.
 */
describe('selling on credit', () => {
  async function debtor(phone: string) {
    return getPrismaClient().user.create({
      data: { phone, password: 'x', role: 'CLIENT', nameRu: 'Клиент', nameUz: 'Mijoz' },
    });
  }

  it('splits the receipt and charges the rest to the customer', async () => {
    const p = await product(5);
    const client = await debtor('998900000101');

    const { sale } = await commitSale(
      { ...cart(line(p, 3)), debtAmount: 2000, debtUserId: client.id },
      MAIN,
    );
    markSettled(sale.id);

    expect(Number(sale.finalAmount)).toBe(3000);
    expect(Number(sale.paidAmount)).toBe(1000);
    expect(Number(sale.debtAmount)).toBe(2000);

    const charge = await getPrismaClient().debtTransaction.findFirst({
      where: { saleId: sale.id },
    });
    expect(Number(charge.amount)).toBe(2000);
    expect(charge.type).toBe('CHARGE');
    expect(charge.settledAt).toBeNull();

    const after = await getPrismaClient().user.findUnique({ where: { id: client.id } });
    expect(Number(after.debt)).toBe(2000);

    // Goods leave on a credit sale exactly as on any other.
    expect(await stockOf(p.id)).toBe(2);
  });

  it('never lets the debt exceed the receipt', async () => {
    // Otherwise paidAmount goes negative and the shift reports less cash than the drawer holds.
    const p = await product(5);
    const client = await debtor('998900000102');

    const { sale } = await commitSale(
      { ...cart(line(p, 1)), debtAmount: 999_999, debtUserId: client.id },
      MAIN,
    );
    markSettled(sale.id);

    expect(Number(sale.debtAmount)).toBe(1000);
    expect(Number(sale.paidAmount)).toBe(0);
  });

  it('ignores a debt with nobody to owe it', async () => {
    const p = await product(5);
    const { sale } = await commitSale({ ...cart(line(p, 1)), debtAmount: 500 }, MAIN);
    markSettled(sale.id);

    expect(Number(sale.debtAmount)).toBe(0);
    expect(Number(sale.paidAmount)).toBe(1000);
  });

  it('records an ordinary sale as fully paid', async () => {
    // The property every drawer figure rests on: paidAmount is the whole receipt unless credit
    // was asked for. An ordinary sale must not have to know this feature exists.
    const p = await product(5);
    const { sale } = await commitSale(cart(line(p, 2)), MAIN);
    markSettled(sale.id);

    expect(Number(sale.paidAmount)).toBe(2000);
    expect(Number(sale.debtAmount)).toBe(0);
    expect(sale.debtUserId).toBeNull();
  });
});
