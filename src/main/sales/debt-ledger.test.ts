import { allocatePayment, recomputeBalance, signedAmount } from './debt-ledger';

/**
 * The nasiya allocator.
 *
 * Worth testing directly because two things ride on it that are invisible from a balance: which
 * receipt a part payment finished, and therefore which receipt may now be fiscalized. A sale is
 * given no fiscal receipt until it is fully paid, so an allocator that settles the wrong charge
 * files the wrong receipt with the tax office.
 *
 * The fake below is the narrow slice of Prisma the module touches, in memory — the real client
 * needs a database, and none of what is being checked here is SQL.
 */

interface Row {
  id: string;
  userId: string;
  type: 'CHARGE' | 'PAYMENT' | 'ADJUSTMENT';
  amount: number;
  saleId: string | null;
  settledAt: Date | null;
  createdAt: Date;
}

function fakeDb(rows: Row[]) {
  const store = [...rows];
  return {
    rows: store,
    debtTransaction: {
      findMany: jest.fn(async (args: { where: Record<string, unknown>; orderBy?: unknown }) => {
        const w = args.where;
        let out = store.filter((r) => r.userId === w.userId);
        if (w.type) out = out.filter((r) => r.type === w.type);
        if (w.settledAt === null) out = out.filter((r) => r.settledAt === null);
        return out.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
      }),
      update: jest.fn(async (args: { where: { id: string }; data: { settledAt: Date } }) => {
        const row = store.find((r) => r.id === args.where.id);
        if (row) row.settledAt = args.data.settledAt;
        return row;
      }),
    },
  };
}

/**
 * Take a payment exactly as `debtors:recordPayment` does — write the ledger row first, then
 * allocate. The allocator reads the ledger rather than taking an amount, so a test that skipped
 * the row would be testing a sequence that never happens.
 */
async function pay(db: ReturnType<typeof fakeDb>, amount: number): Promise<string[]> {
  db.rows.push(payment(`p${db.rows.length}`, amount));
  return allocatePayment(db as never, 'u1');
}

let clock = 0;
const charge = (id: string, amount: number, saleId: string | null = `sale-${id}`): Row => ({
  id,
  userId: 'u1',
  type: 'CHARGE',
  amount,
  saleId,
  settledAt: null,
  createdAt: new Date(2026, 0, 1, 0, 0, ++clock),
});

const payment = (id: string, amount: number): Row => ({
  id,
  userId: 'u1',
  type: 'PAYMENT',
  amount: -amount,
  saleId: null,
  settledAt: null,
  createdAt: new Date(2026, 0, 1, 0, 0, ++clock),
});

describe('the sign convention', () => {
  it('always raises a debt for a charge and lowers it for a payment', () => {
    // The renderer sends a magnitude; a caller that sent the wrong sign must not be able to turn
    // a payment into a charge.
    expect(signedAmount('CHARGE', 5000)).toBe(5000);
    expect(signedAmount('CHARGE', -5000)).toBe(5000);
    expect(signedAmount('PAYMENT', 5000)).toBe(-5000);
    expect(signedAmount('PAYMENT', -5000)).toBe(-5000);
  });

  it('takes an adjustment exactly as given, in either direction', () => {
    // The one type that exists to correct a ledger by hand, so it must keep its sign.
    expect(signedAmount('ADJUSTMENT', -3000)).toBe(-3000);
    expect(signedAmount('ADJUSTMENT', 3000)).toBe(3000);
  });
});

describe('allocating a payment', () => {
  it('settles the oldest receipt first', async () => {
    const db = fakeDb([charge('c1', 30_000), charge('c2', 50_000)]);

    expect(await pay(db, 30_000)).toEqual(['sale-c1']);
    expect(db.rows.find((r) => r.id === 'c1')?.settledAt).not.toBeNull();
    expect(db.rows.find((r) => r.id === 'c2')?.settledAt).toBeNull();
  });

  it('settles nothing when the payment does not cover the oldest receipt', async () => {
    // The money is still owed against it — and the receipt must NOT be fiscalized yet.
    const db = fakeDb([charge('c1', 30_000)]);

    expect(await pay(db, 10_000)).toEqual([]);
    expect(db.rows[0].settledAt).toBeNull();
  });

  it('finishes a receipt that earlier part payments had already eaten into', async () => {
    // 30 000 owed, 10 000 paid last week, 20 000 paid now: that receipt is now paid for.
    const db = fakeDb([charge('c1', 30_000), payment('p1', 10_000)]);

    expect(await pay(db, 20_000)).toEqual(['sale-c1']);
  });

  it('settles several receipts at once when the payment covers them', async () => {
    const db = fakeDb([charge('c1', 10_000), charge('c2', 20_000), charge('c3', 90_000)]);

    expect(await pay(db, 30_000)).toEqual(['sale-c1', 'sale-c2']);
    expect(db.rows.find((r) => r.id === 'c3')?.settledAt).toBeNull();
  });

  it('carries the remainder onto the next receipt rather than losing it', async () => {
    const db = fakeDb([charge('c1', 10_000), charge('c2', 20_000)]);

    // 15 000 settles the first and leaves 5 000 against the second...
    expect(await pay(db, 15_000)).toEqual(['sale-c1']);
    // ...so 15 000 more finishes it, even though the charge itself is 20 000.
    expect(await pay(db, 15_000)).toEqual(['sale-c2']);
  });

  it('ignores an already settled charge', async () => {
    // A settled charge comes with the payment that settled it — the ledger is what says the money
    // arrived, and a fixture without it would be asking the allocator to spend the same som twice.
    const settled = { ...charge('c1', 10_000), settledAt: new Date() };
    const db = fakeDb([settled, payment('p-old', 10_000), charge('c2', 10_000)]);

    expect(await pay(db, 10_000)).toEqual(['sale-c2']);
  });

  it('settles nothing for a payment of zero', async () => {
    const db = fakeDb([charge('c1', 10_000)]);
    expect(await pay(db, 0)).toEqual([]);
  });

  it('reports a charge with no sale behind it without breaking the run', async () => {
    // An opening balance typed in by hand has no receipt to fiscalize, and must not stop the
    // charges after it from being settled.
    const db = fakeDb([charge('c1', 10_000, null), charge('c2', 10_000)]);

    expect(await pay(db, 20_000)).toEqual(['sale-c2']);
    expect(db.rows.filter((r) => r.type === 'CHARGE').every((r) => r.settledAt !== null)).toBe(
      true,
    );
  });

  it('does not let overpayment settle a receipt that was never charged', async () => {
    const db = fakeDb([charge('c1', 10_000)]);
    // Paying 50 000 against a 10 000 debt leaves them 40 000 in credit, not four receipts paid.
    expect(await pay(db, 50_000)).toEqual(['sale-c1']);
  });
});

describe('recomputing a balance', () => {
  it('sums the ledger the way the stored balance should have moved', async () => {
    const db = fakeDb([charge('c1', 30_000), charge('c2', 20_000), payment('p1', 15_000)]);
    expect(await recomputeBalance(db as never, 'u1')).toBe(35_000);
  });

  it('goes negative when someone has paid ahead', async () => {
    const db = fakeDb([charge('c1', 10_000), payment('p1', 25_000)]);
    expect(await recomputeBalance(db as never, 'u1')).toBe(-15_000);
  });
});
