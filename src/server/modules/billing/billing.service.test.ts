import { Prisma } from '@prisma/client';
import { BalanceService } from './balance.service';
import { BillingService } from './billing.service';
import { DAY_MS, DEFAULT_SUBSCRIPTION_RULES } from '../../../shared/utils/subscription';

/**
 * Subscriptions paid from the store balance, against an in-memory store and ledger that behave
 * like Postgres where it matters: the ledger's (store, type, period start) key is unique, and a
 * transaction that throws leaves nothing behind.
 */

const NOW = new Date('2026-09-22T12:00:00.000Z');
const days = (n: number) => new Date(NOW.getTime() + n * DAY_MS);
const PRICES = { starter: 150_000, pro: 300_000, vip: 5_000_000, extraTerminal: 50_000 };

type StoreRow = {
  id: string;
  subscriptionPlan: string | null;
  subscriptionExpiresAt: Date | null;
  subscriptionGraceFrom: Date | null;
  subscriptionRequired: boolean;
  extraTerminals: number;
  balance: number;
  scheduledDeleteAt: Date | null;
};
type LedgerRow = {
  storeId: string;
  type: string;
  amount: number;
  balanceAfter: number;
  periodStart: Date | null;
  note: string | null;
  createdById: string | null;
  createdAt: Date;
};

function database(stores: StoreRow[]) {
  let ledger: LedgerRow[] = [];
  const key = (r: { storeId: string; type: string; periodStart: Date | null }) =>
    r.periodStart ? `${r.storeId}|${r.type}|${r.periodStart.toISOString()}` : null;
  const byId = (id: string) => stores.find((s) => s.id === id) ?? null;
  const pick = (row: StoreRow | null) => (row ? { ...row } : null);
  // The transaction client is the database itself; held by reference to keep the types plain.
  const self: { db: unknown } = { db: null };

  const db = {
    get ledger() {
      return ledger;
    },
    store: {
      findUnique: jest.fn(async ({ where }: { where: { id: string } }) => pick(byId(where.id))),
      findMany: jest.fn(
        async ({ where }: { where: { subscriptionPlan: { in: string[] }; subscriptionExpiresAt: { lte: Date } } }) =>
          stores
            .filter(
              (s) =>
                s.subscriptionPlan &&
                where.subscriptionPlan.in.includes(s.subscriptionPlan) &&
                s.subscriptionExpiresAt &&
                s.subscriptionExpiresAt <= where.subscriptionExpiresAt.lte &&
                !s.scheduledDeleteAt,
            )
            .map((s) => ({ id: s.id })),
      ),
      update: jest.fn(async ({ where, data }: { where: { id: string }; data: { balance: { increment: number } } }) => {
        const s = byId(where.id)!;
        s.balance += data.balance.increment;
        return { balance: new Prisma.Decimal(s.balance) };
      }),
      updateMany: jest.fn(
        async ({
          where,
          data,
        }: {
          where: { id: string; subscriptionExpiresAt: Date };
          data: { subscriptionExpiresAt: Date; subscriptionGraceFrom: null };
        }) => {
          const s = byId(where.id);
          if (!s || s.subscriptionExpiresAt?.getTime() !== where.subscriptionExpiresAt.getTime()) {
            return { count: 0 };
          }
          Object.assign(s, data);
          return { count: 1 };
        },
      ),
    },
    balanceTransaction: {
      findUnique: jest.fn(
        async ({ where }: { where: { storeId_type_periodStart: { storeId: string; type: string; periodStart: Date } } }) => {
          const k = key(where.storeId_type_periodStart);
          return ledger.find((r) => key(r) === k) ?? null;
        },
      ),
      create: jest.fn(async ({ data }: { data: Omit<LedgerRow, 'createdAt'> & { balanceAfter: Prisma.Decimal } }) => {
        const k = key(data);
        if (k && ledger.some((r) => key(r) === k)) {
          throw new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
            code: 'P2002',
            clientVersion: 'test',
          });
        }
        ledger.push({ ...data, balanceAfter: Number(data.balanceAfter), createdAt: new Date() });
      }),
    },
    // All or nothing, as Postgres: a throw inside restores the stores and the ledger.
    $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>): Promise<unknown> => {
      const saved = stores.map((s) => ({ ...s }));
      const savedLedger = [...ledger];
      try {
        return await fn(self.db);
      } catch (e) {
        saved.forEach((s, i) => Object.assign(stores[i], s));
        ledger = savedLedger;
        throw e;
      }
    }),
  };
  self.db = db;
  return db;
}

function store(overrides: Partial<StoreRow> = {}): StoreRow {
  return {
    id: '1000',
    subscriptionPlan: 'STARTER',
    subscriptionExpiresAt: NOW,
    subscriptionGraceFrom: null,
    subscriptionRequired: true,
    extraTerminals: 0,
    balance: 0,
    scheduledDeleteAt: null,
    ...overrides,
  };
}

function build(rows: StoreRow[]) {
  const db = database(rows);
  const siteConfig = {
    getSubscriptionRules: jest.fn(async () => DEFAULT_SUBSCRIPTION_RULES), // warn 3, grace 3
    getSubscriptionPlans: jest.fn(async () => PRICES),
  };
  const balance = new BalanceService(db as never);
  const billing = new BillingService(db as never, siteConfig as never, balance);
  return { db, billing, balance, row: rows[0] };
}

describe('charging at the due date', () => {
  it('takes the fee and renews for a month when the balance covers it', async () => {
    const { billing, db, row } = build([store({ balance: 200_000 })]);

    expect(await billing.bill('1000', 'job', NOW)).toBe('charged-renewed');
    expect(row.balance).toBe(50_000);
    expect(row.subscriptionExpiresAt!.toISOString()).toBe('2026-10-22T12:00:00.000Z');
    expect(db.ledger).toEqual([
      expect.objectContaining({ type: 'SUBSCRIPTION', amount: -150_000, balanceAfter: 50_000, periodStart: NOW }),
    ]);
  });

  it('takes it into the negative, and leaves the expiry for grace to run', async () => {
    const { billing, row } = build([store({ balance: 100_000 })]);

    expect(await billing.bill('1000', 'job', NOW)).toBe('charged-in-debt');
    expect(row.balance).toBe(-50_000);
    expect(row.subscriptionExpiresAt).toEqual(NOW);
  });

  it('charges each extra terminal on top of the plan', async () => {
    const { billing, row } = build([store({ subscriptionPlan: 'PRO', extraTerminals: 2, balance: 1_000_000 })]);
    await billing.bill('1000', 'job', NOW);
    expect(row.balance).toBe(1_000_000 - 300_000 - 2 * 50_000);
  });

  // However often the job runs, a period costs one fee.
  it('never charges a period twice', async () => {
    const { billing, db, row } = build([store({ balance: 100_000 })]);
    await billing.bill('1000', 'job', NOW);
    expect(await billing.bill('1000', 'job', days(1))).toBe('in-debt');
    expect(await billing.bill('1000', 'job', days(2))).toBe('in-debt');
    expect(row.balance).toBe(-50_000);
    expect(db.ledger).toHaveLength(1);
  });

  // Another server, or an overlapping run, charged it between the check and the charge.
  it('leaves the balance alone when the charge turns out to be a duplicate', async () => {
    const { billing, db, row } = build([store({ balance: 200_000 })]);
    db.balanceTransaction.findUnique.mockResolvedValueOnce(null); // stale "not charged"
    db.ledger.push({
      storeId: '1000', type: 'SUBSCRIPTION', amount: -150_000, balanceAfter: 50_000,
      periodStart: NOW, note: null, createdById: null, createdAt: NOW,
    });
    row.balance = 50_000;

    expect(await billing.bill('1000', 'job', NOW)).toBe('renewed');
    expect(row.balance).toBe(50_000);
    expect(db.ledger).toHaveLength(1);
  });

  it('bills nothing before the due date', async () => {
    const { billing, row } = build([store({ subscriptionExpiresAt: days(1), balance: 500_000 })]);
    expect(await billing.bill('1000', 'job', NOW)).toBe('not-due');
    expect(row.balance).toBe(500_000);
  });

  it('bills neither TRIAL nor VIP nor a plan without a date', async () => {
    for (const s of [
      store({ subscriptionPlan: 'TRIAL' }),
      store({ subscriptionPlan: 'VIP' }),
      store({ subscriptionExpiresAt: null }),
    ]) {
      const { billing, db } = build([{ ...s, balance: 500_000 }]);
      expect(await billing.bill('1000', 'job', NOW)).toBe('not-due');
      expect(db.ledger).toHaveLength(0);
    }
  });

  // Blocked before it was ever charged — say, expired long before billing shipped.
  it('does not bill a store the job finds already blocked', async () => {
    const { billing, db } = build([store({ subscriptionExpiresAt: days(-40), balance: 500_000 })]);
    expect(await billing.bill('1000', 'job', NOW)).toBe('skipped-blocked');
    expect(db.ledger).toHaveLength(0);
  });
});

describe('a top-up settling the debt', () => {
  it('in the grace days: renews the month from the old expiry — the store used those days', async () => {
    const { billing, balance, row } = build([store({ balance: 100_000 })]);
    await billing.bill('1000', 'job', NOW); // −50 000
    await balance.apply('1000', { type: 'TOPUP', amount: 60_000 });

    expect(await billing.bill('1000', 'topup', days(1))).toBe('renewed');
    expect(row.balance).toBe(10_000);
    expect(row.subscriptionExpiresAt!.toISOString()).toBe('2026-10-22T12:00:00.000Z');
  });

  it('after the block: renews from the payment, not for days it could not use', async () => {
    const { billing, balance, row } = build([store({ balance: 100_000 })]);
    await billing.bill('1000', 'job', NOW);
    await balance.apply('1000', { type: 'TOPUP', amount: 60_000 });

    expect(await billing.bill('1000', 'topup', days(10))).toBe('renewed');
    expect(row.subscriptionExpiresAt).toEqual(new Date('2026-11-02T12:00:00.000Z'));
  });

  it('renews nothing while the top-up still leaves it negative', async () => {
    const { billing, balance, row } = build([store({ balance: 100_000 })]);
    await billing.bill('1000', 'job', NOW);
    await balance.apply('1000', { type: 'TOPUP', amount: 20_000 });

    expect(await billing.bill('1000', 'topup', days(1))).toBe('in-debt');
    expect(row.balance).toBe(-30_000);
    expect(row.subscriptionExpiresAt).toEqual(NOW);
  });

  it('bills a blocked, never-charged store once it pays, and renews it from the payment', async () => {
    const { billing, balance, db, row } = build([store({ subscriptionExpiresAt: days(-40), balance: 0 })]);
    await balance.apply('1000', { type: 'TOPUP', amount: 200_000 });

    expect(await billing.bill('1000', 'topup', NOW)).toBe('charged-renewed');
    expect(row.balance).toBe(50_000);
    expect(row.subscriptionExpiresAt!.toISOString()).toBe('2026-10-22T12:00:00.000Z');
    expect(db.ledger.map((r) => r.type)).toEqual(['TOPUP', 'SUBSCRIPTION']);
  });

  it('clears the ship-day grace once a month is paid', async () => {
    const { billing, row } = build([store({ balance: 500_000, subscriptionGraceFrom: days(-1) })]);
    await billing.bill('1000', 'job', NOW);
    expect(row.subscriptionGraceFrom).toBeNull();
  });
});

describe('the job', () => {
  it('bills every due STARTER and PRO store, and none scheduled for deletion', async () => {
    const { billing, db } = build([
      store({ id: 'a', balance: 500_000 }),
      store({ id: 'b', subscriptionPlan: 'PRO', balance: 500_000 }),
      store({ id: 'c', subscriptionPlan: 'VIP', balance: 500_000 }),
      store({ id: 'd', balance: 500_000, scheduledDeleteAt: days(20) }),
      store({ id: 'e', balance: 500_000, subscriptionExpiresAt: days(3) }),
    ]);
    await billing.run(NOW);
    expect(db.ledger.map((r) => r.storeId).sort()).toEqual(['a', 'b']);
  });

  it('goes on to the next store when one fails', async () => {
    const { billing, db } = build([store({ id: 'a', balance: 500_000 }), store({ id: 'b', balance: 500_000 })]);
    db.store.findUnique.mockRejectedValueOnce(new Error('boom'));
    await billing.run(NOW);
    expect(db.ledger.map((r) => r.storeId)).toEqual(['b']);
  });
});

describe('nextCharge', () => {
  it('says when and how much', async () => {
    const { billing } = build([store({ subscriptionExpiresAt: days(5), extraTerminals: 1, balance: 10_000 })]);
    expect(await billing.nextCharge('1000', NOW)).toEqual({
      at: days(5).toISOString(),
      amountUzs: 200_000,
      owedUzs: 0,
      balanceUzs: 10_000,
    });
  });

  it('says what is owed once a charge left the balance negative', async () => {
    const { billing } = build([store({ balance: 100_000 })]);
    await billing.bill('1000', 'job', NOW);
    expect(await billing.nextCharge('1000', days(1))).toMatchObject({ owedUzs: 50_000, balanceUzs: -50_000 });
  });

  it('is null for a plan that is not billed', async () => {
    const { billing } = build([store({ subscriptionPlan: 'VIP' })]);
    expect(await billing.nextCharge('1000', NOW)).toBeNull();
  });
});
