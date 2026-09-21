import { getPrismaClient } from '../database/sqlite-client';

/**
 * Nasiya: the ledger behind a customer's balance.
 *
 * Two facts are kept, deliberately both: `users.debt` answers "how much does this person owe
 * right now" in one read, and `debt_transactions` says how it got there. They are written in the
 * same transaction, and `recomputeBalance` exists to prove they still agree — the same shape the
 * supplier ledger has used since it shipped (`suppliers:getBalance`).
 *
 * The sign convention is fixed HERE, never taken from a caller: a CHARGE increases the debt, a
 * PAYMENT reduces it. A renderer that sent a negative "payment" would otherwise raise a debt.
 *
 * Payments settle the oldest unpaid sale first. That ordering is not cosmetic: a credit sale gets
 * no fiscal receipt until it is fully paid, so something has to decide WHICH receipt a part
 * payment finished — and "the one they have owed longest" is the answer a shopkeeper would give.
 */

/** `getPrismaClient()` is `any` — a runtime require — so the rows it returns are shaped by hand. */
type Prisma = ReturnType<typeof getPrismaClient>;

export type DebtTxnType = 'CHARGE' | 'PAYMENT' | 'ADJUSTMENT';

export interface DebtCharge {
  id: string;
  amount: number;
  saleId: string | null;
  createdAt: Date;
}

/** Money is stored as SQLite REAL; round every total to tiyin so 0.1 + 0.2 never owes 1 tiyin. */
const round = (n: number): number => Math.round(n * 100) / 100;

/**
 * What a transaction of this type does to the balance.
 *
 * ADJUSTMENT is the only one that takes the caller's sign — it exists precisely to correct a
 * ledger by hand, in whichever direction is wrong.
 */
export function signedAmount(type: DebtTxnType, amount: number): number {
  const magnitude = Math.abs(round(amount));
  if (type === 'CHARGE') return magnitude;
  if (type === 'PAYMENT') return -magnitude;
  return round(amount);
}

/**
 * Put a credit sale on a customer's tab.
 *
 * Runs inside the caller's transaction so a sale can never exist without its charge, nor a charge
 * without its sale.
 */
export async function chargeSaleToDebt(
  tx: Prisma,
  input: {
    userId: string;
    saleId: string;
    amount: number;
    dueDate?: Date | null;
    createdBy: string;
  },
): Promise<void> {
  const amount = signedAmount('CHARGE', input.amount);
  if (amount <= 0) return;

  await tx.debtTransaction.create({
    data: {
      userId: input.userId,
      type: 'CHARGE',
      amount,
      saleId: input.saleId,
      dueDate: input.dueDate ?? null,
      createdBy: input.createdBy,
    },
  });
  await tx.user.update({
    where: { id: input.userId },
    data: { debt: { increment: amount } },
  });
}

/**
 * Settle whatever a customer's payments now cover, oldest charge first.
 *
 * Called AFTER the payment row has been written, and reads what it needs from the ledger rather
 * than taking an amount — see the note inside.
 *
 * Returns the sales that have just become fully paid for; the caller fiscalizes those, and only
 * those. A payment larger than the outstanding charges settles everything it can and leaves the
 * rest as a credit balance (`users.debt` goes negative), which is what happens when someone
 * rounds up and leaves the change on their account.
 *
 * `settledAt` is the only thing distinguishing a paid charge from an open one, so it is stamped
 * in the same transaction as the balance it settles.
 */
export async function allocatePayment(tx: Prisma, userId: string): Promise<string[]> {
  // Everything paid and not yet accounted for by a settled charge — including the payment the
  // caller has just written. Deliberately NOT "the amount of this payment": the row is already
  // in the ledger by the time this runs, so taking an amount as well would count it twice, and
  // deriving it here also settles anything a previous crash left unallocated.
  let remaining = await unappliedCredit(tx, userId);
  if (remaining <= 0) return [];

  const open = (await tx.debtTransaction.findMany({
    where: { userId, type: 'CHARGE', settledAt: null },
    orderBy: { createdAt: 'asc' },
  })) as DebtCharge[];

  const settledSales: string[] = [];
  for (const charge of open) {
    const outstanding = round(Number(charge.amount));
    if (remaining < outstanding) break;

    await stampSettled(tx, charge.id);
    if (charge.saleId) settledSales.push(charge.saleId);
    remaining = round(remaining - outstanding);
  }

  return settledSales;
}

/**
 * Payment money not yet accounted for by a settled charge.
 *
 * Everything paid so far, less everything the settled charges consumed. Zero for a customer who
 * has always paid in whole receipts; positive when a part payment is sitting against the oldest
 * open one. Derived rather than stored, so it cannot drift out of step with the rows.
 */
async function unappliedCredit(tx: Prisma, userId: string): Promise<number> {
  const rows = (await tx.debtTransaction.findMany({ where: { userId } })) as Array<{
    type: string;
    amount: unknown;
    settledAt: Date | null;
  }>;

  let paid = 0;
  let consumed = 0;
  for (const r of rows) {
    // Payments are negative, and an ADJUSTMENT counts only in the forgiving direction — one that
    // raises a debt is not money anyone handed over.
    if (r.type !== 'CHARGE') paid += Math.max(0, -Number(r.amount));
    else if (r.settledAt) consumed += Number(r.amount);
  }

  return round(Math.max(0, paid - consumed));
}

async function stampSettled(tx: Prisma, chargeId: string): Promise<void> {
  await tx.debtTransaction.update({
    where: { id: chargeId },
    data: { settledAt: new Date() },
  });
}

/**
 * The balance the ledger implies, for comparison against the stored one.
 *
 * The two are written together and should never differ; this is what makes "should never" an
 * assertion the debtors screen can actually make rather than a hope.
 */
export async function recomputeBalance(tx: Prisma, userId: string): Promise<number> {
  const rows = await tx.debtTransaction.findMany({ where: { userId } });
  return round(rows.reduce((sum: number, r: { amount: unknown }) => sum + Number(r.amount), 0));
}
