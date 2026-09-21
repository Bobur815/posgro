import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

/**
 * A database created by an older build must end up with every table the current build queries.
 *
 * `createSchemaIfNeeded` used to return early when `local_config` already existed, so a table
 * added to it later never reached a terminal whose database predated it. `audit_logs` shipped
 * exactly that way and killed the shift panel with "no such table: audit_logs" — on one store's
 * terminal only, which is the worst way to find out.
 *
 * `sqlite-schema.test.ts` could not catch it: that test walks the Prisma models, and `audit_logs`
 * is raw-SQL only. This one starts from a legacy database and asserts the real outcome instead.
 */

const dataDir = mkdtempSync(join(tmpdir(), 'posgro-legacy-'));

// Real SQLite, bcrypt and (for some) a real HTTP server, on a machine running every other suite at
// once: a cold full run has pushed single steps past Jest's 5s default and cascaded into unrelated
// failures. A generous ceiling only changes how long a genuinely hung test takes to fail.
jest.setTimeout(30_000);

jest.mock('electron', () => ({
  app: { getPath: () => dataDir, getAppPath: () => join(__dirname, '..', '..', '..') },
}));

import { initializeDatabase, closeDatabase, getPrismaClient } from './sqlite-client';

/** Tables the app reads or writes by raw SQL, so no Prisma model declares them. */
const RAW_SQL_TABLES = ['audit_logs'];

async function tableNames(): Promise<string[]> {
  // getPrismaClient() is `any` — the client is resolved through a runtime require — so the row
  // type is asserted rather than inferred.
  const rows = (await getPrismaClient().$queryRawUnsafe(
    "SELECT name FROM sqlite_master WHERE type='table'",
  )) as Array<{ name: string }>;
  return rows.map((r) => r.name);
}

beforeAll(async () => {
  // A database from an older build: `local_config` exists, so the old guard would have declared
  // the schema complete and skipped everything else.
  const { PrismaClient } = require('../../generated/prisma-sqlite');
  const seed = new PrismaClient({
    datasources: { db: { url: `file:${join(dataDir, 'pos-local.db')}` } },
  });
  await seed.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS local_config (
      id TEXT PRIMARY KEY DEFAULT 'config',
      store_id TEXT NOT NULL,
      store_name TEXT NOT NULL,
      terminal_id TEXT NOT NULL,
      api_url TEXT NOT NULL,
      last_sync DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  // An activated terminal, so column backfill is exercised on a real row rather than only on the
  // column default a fresh insert would pick up.
  await seed.$executeRawUnsafe(`
    INSERT INTO local_config (id, store_id, store_name, terminal_id, api_url)
    VALUES ('config', '1000', 'Legacy store', 'T1', 'https://pos.example/api')
  `);
  // A receipt from before the nasiya split, in a `sales` table that has no paid_amount column at
  // all — the shape every terminal in the field upgrades from.
  await seed.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS sales (
      id TEXT PRIMARY KEY,
      receipt_number TEXT UNIQUE NOT NULL,
      total_amount REAL NOT NULL,
      discount_amount REAL DEFAULT 0,
      final_amount REAL NOT NULL,
      payment_method TEXT NOT NULL,
      cashier_id TEXT NOT NULL,
      cashier_name TEXT NOT NULL,
      terminal_id TEXT NOT NULL,
      synced INTEGER DEFAULT 0,
      synced_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await seed.$executeRawUnsafe(`
    INSERT INTO sales (id, receipt_number, total_amount, discount_amount, final_amount,
                       payment_method, cashier_id, cashier_name, terminal_id)
    VALUES ('old-1', 'OLD-1', 250000, 0, 250000, 'cash', 'c1', 'Кассир', 'T1')
  `);
  // A debt_transactions table as an INTERMEDIATE build left it: created, but without the column
  // that was added to the CREATE afterwards. CREATE TABLE IF NOT EXISTS does nothing for a table
  // that is already there, so this is the shape that broke on boot with "no such column: synced".
  await seed.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS debt_transactions (
      id             TEXT PRIMARY KEY,
      user_id        TEXT NOT NULL,
      type           TEXT NOT NULL,
      amount         DECIMAL NOT NULL,
      payment_method TEXT,
      sale_id        TEXT,
      settled_at     DATETIME,
      due_date       DATETIME,
      note           TEXT,
      created_by     TEXT NOT NULL,
      created_at     DATETIME NOT NULL DEFAULT (datetime('now'))
    )
  `);
  await seed.$disconnect();

  await initializeDatabase();
}, 120_000);

afterAll(async () => {
  await closeDatabase();
  rmSync(dataDir, { recursive: true, force: true });
});

describe('upgrading a database created by an older build', () => {
  it.each(RAW_SQL_TABLES)('creates the raw-SQL table %s', async (table) => {
    expect(await tableNames()).toContain(table);
  });

  it('creates the tables the Prisma models need', async () => {
    const names = await tableNames();
    for (const table of ['users', 'products', 'sales', 'sale_items', 'smenas', 'system_settings']) {
      expect(names).toContain(table);
    }
  });

  it('creates tables added by later migrations', async () => {
    const names = await tableNames();
    for (const table of [
      'inventory_counts',
      'inventory_count_items',
      '_CategoryToSupplier',
      'debt_transactions',
    ]) {
      expect(names).toContain(table);
    }
  });

  /**
   * Nasiya columns on tables that existed long before it.
   *
   * Written as a real INSERT rather than a pragma check because that is the failure being
   * guarded: the generated client names every scalar it knows about, so one column missing from
   * a terminal's database is P2022 on the next sale — no cashier can sell, on every till at once.
   */
  it('can write a sale and a user with the nasiya columns', async () => {
    const prisma = getPrismaClient();
    const user = await prisma.user.create({
      data: {
        phone: '998900000001',
        password: 'x',
        role: 'CLIENT',
        nameUz: 'Mijoz',
        nameRu: 'Клиент',
        debt: 50_000,
      },
    });
    expect(Number(user.debt)).toBe(50_000);
    expect(user.debtDueDate).toBeNull();

    const sale = await prisma.sale.create({
      data: {
        receiptNumber: 'LEGACY-1',
        totalAmount: 100_000,
        finalAmount: 100_000,
        paidAmount: 30_000,
        debtAmount: 70_000,
        debtUserId: user.id,
        paymentMethod: 'cash',
        cashierId: 'c1',
        cashierName: 'Кассир',
        terminalId: 'T1',
      },
    });
    expect(Number(sale.debtAmount)).toBe(70_000);

    const txn = await prisma.debtTransaction.create({
      data: {
        userId: user.id,
        type: 'CHARGE',
        amount: 70_000,
        saleId: sale.id,
        createdBy: 'c1',
      },
    });
    expect(txn.settledAt).toBeNull();
  });

  /**
   * The failure this actually shipped as: boot died with P2010 "no such column: synced".
   *
   * Neither existing guard could see it. sqlite-schema.test.ts compares the Prisma models against
   * the text of sqlite-client.ts, where the column IS present — in a CREATE TABLE that never runs
   * again once the table exists. And the rest of this file starts from a database old enough to
   * have no debt_transactions at all, so the CREATE does run and the column appears.
   *
   * Only a database left half-built by an intermediate version shows it, which is what the seed
   * above now sets up.
   */
  it('adds a column to a table an earlier build already created', async () => {
    const prisma = getPrismaClient();
    const rows = (await prisma.$queryRawUnsafe(
      "SELECT name FROM pragma_table_info('debt_transactions')",
    )) as Array<{ name: string }>;
    expect(rows.map((r) => r.name)).toContain('synced');

    // The index that threw on boot exists, and the client can write the column.
    const user = await prisma.user.create({
      data: { phone: '998900000009', password: 'x', role: 'CLIENT', nameUz: 'M', nameRu: 'К' },
    });
    const txn = await prisma.debtTransaction.create({
      data: { userId: user.id, type: 'CHARGE', amount: 1000, createdBy: 'c1' },
    });
    expect(txn.synced).toBe(false);
  });

  /**
   * Receipts taken before the split existed were paid in full, and the backfill has to say so.
   * Left at the column default, every historical sale would read as 0 paid and deflate any
   * drawer figure computed from paidAmount.
   *
   * The backfill runs once, inside the "column did not exist" guard, and that placement matters:
   * repeating it on every boot would rewrite exactly the sales this feature exists for — a fully
   * credit sale legitimately has paid_amount 0 and must stay that way.
   */
  it('backfills paid_amount on sales that predate the split', async () => {
    const old = await getPrismaClient().sale.findUnique({ where: { id: 'old-1' } });
    expect(Number(old.paidAmount)).toBe(250_000);
    expect(Number(old.debtAmount)).toBe(0);
  });

  it('leaves a fully credit sale at zero paid across a reboot', async () => {
    const prisma = getPrismaClient();
    await prisma.sale.create({
      data: {
        receiptNumber: 'CREDIT-1',
        totalAmount: 80_000,
        finalAmount: 80_000,
        paidAmount: 0,
        debtAmount: 80_000,
        paymentMethod: 'debt',
        cashierId: 'c1',
        cashierName: 'Кассир',
        terminalId: 'T1',
      },
    });
    await closeDatabase();
    await initializeDatabase();

    const credit = await getPrismaClient().sale.findFirst({
      where: { receiptNumber: 'CREDIT-1' },
    });
    expect(Number(credit.paidAmount)).toBe(0);
  }, 60_000);

  // The failure the user actually hit: the shift panel's Z-report reads deleted sales from
  // audit_logs, and a missing table took down `smena:getCurrent` on every open.
  it('can query audit_logs the way the shift report does', async () => {
    const rows = await getPrismaClient().$queryRawUnsafe(
      `SELECT entity_id FROM audit_logs WHERE action = 'DELETE_SALE'`,
    );
    expect(Array.isArray(rows)).toBe(true);
  });

  it('leaves the existing local_config row untouched by a second boot', async () => {
    await getPrismaClient().localConfig.upsert({
      where: { id: 'config' },
      update: { storeName: 'Kept' },
      create: {
        id: 'config',
        storeId: 's',
        storeName: 'Kept',
        terminalId: 'T1',
        apiUrl: 'http://x',
      },
    });
    await closeDatabase();
    await initializeDatabase();
    const config = await getPrismaClient().localConfig.findUnique({ where: { id: 'config' } });
    expect(config?.storeName).toBe('Kept');
  }, 60_000);

  /**
   * The whole fleet upgrades into `is_main` at once, and a shop already running two independent
   * tills has to carry on doing exactly that.
   *
   * `DEFAULT 1` is what makes it inert: SQLite backfills the existing row, so the terminal comes
   * up as a main. `DEFAULT 0` would turn both of that shop's tills into satellites with nowhere to
   * point — the same release, every terminal, at once. One character, so it is asserted rather
   * than trusted. See tasks/LAN_MAIN_TERMINAL_PLAN.md §10.1.
   */
  it('leaves a terminal from before the column existed as a main', async () => {
    const config = await getPrismaClient().localConfig.findUnique({ where: { id: 'config' } });
    expect(config).not.toBeNull();
    expect(config.isMain).toBe(true);
    expect(config.mainTerminalUrl).toBeNull();
  });

  // §11.3: an upgraded terminal belongs to no lineage yet, so the generation guard compares
  // nothing until a main pairs its first till.
  it('upgrades into no lineage and generation zero', async () => {
    const config = await getPrismaClient().localConfig.findUnique({ where: { id: 'config' } });
    expect(config.lanLineage).toBeNull();
    expect(config.mainGeneration).toBe(0);
  });
});
