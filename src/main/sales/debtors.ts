import * as bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';
import { getPrismaClient } from '../database/sqlite-client';
import { allocatePayment, recomputeBalance, signedAmount } from './debt-ledger';
import { fiscalizeSettledSale } from './settle-sale';
import { addShiftMovement, currentShift } from './shifts';
import { isCashTender } from '../../shared/constants';

/**
 * Nasiya on this terminal's database: the people who owe the shop money, and what they have paid.
 *
 * One implementation for two callers. `ipc/debtors-handlers.ts` runs it for this till's own
 * screens; the main's `/terminal/debtors…` routes run it for a satellite, whose database holds no
 * users — so a satellite's customer, payment or correction lands in the main's book, a payment in
 * cash goes into the satellite's own shift there, and a receipt it finishes paying for is
 * fiscalized by the main, as the satellite's sales are.
 *
 * Who may do what is the caller's to check: staff for most of it, an admin to edit or correct.
 *
 * A debtor is any `User` with a balance, not a table of its own — the person taking goods on
 * credit may equally BE staff, and a second table would mean two answers to "who is this phone
 * number". CLIENT marks a customer record: someone who exists only to run a tab, is refused at
 * every login path, and is kept out of staff lists. The arithmetic lives in `debt-ledger.ts`.
 */

const num = (v: unknown): number => Number(v ?? 0);

/** What the renderer sees for one debtor. */
export function serializeDebtor(user: {
  id: string;
  phone: string;
  nameRu: string;
  nameUz: string;
  role: string;
  debt: unknown;
  debtDueDate: Date | null;
  active: boolean;
  createdAt: Date;
}) {
  return {
    id: user.id,
    phone: user.phone,
    nameRu: user.nameRu,
    nameUz: user.nameUz,
    // So the picker can say "Алишер (кассир)" — two people with one name, one of whom works here.
    role: user.role,
    debt: num(user.debt),
    debtDueDate: user.debtDueDate,
    isActive: user.active,
    createdAt: user.createdAt,
  };
}

function serializeTxn(t: {
  id: string;
  type: string;
  amount: unknown;
  paymentMethod: string | null;
  saleId: string | null;
  settledAt: Date | null;
  dueDate: Date | null;
  note: string | null;
  createdBy: string;
  createdAt: Date;
}) {
  return { ...t, amount: num(t.amount) };
}

export interface DebtorListOptions {
  search?: string;
  withDebtOnly?: boolean;
  includeStaff?: boolean;
}

export async function listDebtors(opts: DebtorListOptions = {}) {
  const search = opts.search?.trim();

  // Staff appear in two cases: when the caller is choosing who to give a tab to (the POS picker
  // asks for them), and whenever the list is of people who actually owe money. The second is not
  // a convenience — a role filter must never be the reason a real debt is missing from the screen
  // that exists to show debts.
  const includeStaff = opts.includeStaff === true || opts.withDebtOnly === true;

  const debtors = await getPrismaClient().user.findMany({
    where: {
      active: true,
      ...(includeStaff ? {} : { role: 'CLIENT' }),
      ...(opts.withDebtOnly ? { debt: { gt: 0 } } : {}),
      // SQLite's LIKE is already case-insensitive for ASCII; Prisma's `mode: 'insensitive'` is a
      // PostgreSQL-only option and throws here, so it is deliberately absent.
      ...(search
        ? {
            OR: [
              { nameRu: { contains: search } },
              { nameUz: { contains: search } },
              { phone: { contains: search } },
            ],
          }
        : {}),
    },
    orderBy: [{ debt: 'desc' }, { nameRu: 'asc' }],
    take: 200,
  });

  return debtors.map(serializeDebtor);
}

export interface NewDebtor {
  nameRu: string;
  nameUz?: string;
  phone: string;
  debtDueDate?: string | null;
}

/**
 * A customer who can take goods on credit. The password column is NOT NULL and this account must
 * never open a session, so it gets a random hash nobody holds the plaintext of — belt and braces
 * behind the role check that every login path makes.
 */
export async function createDebtor(data: NewDebtor) {
  const prisma = getPrismaClient();

  const phone = String(data.phone ?? '').replace(/\D/g, '');
  if (!phone) throw new Error('debtors.errors.phone_required');
  const nameRu = String(data.nameRu ?? '').trim();
  if (!nameRu) throw new Error('debtors.errors.name_required');

  const clash = await prisma.user.findUnique({ where: { phone } });
  if (clash) throw new Error('debtors.errors.phone_taken');

  const config = await prisma.localConfig.findUnique({ where: { id: 'config' } });
  const debtor = await prisma.user.create({
    data: {
      phone,
      password: await bcrypt.hash(randomBytes(24).toString('hex'), 10),
      role: 'CLIENT',
      nameRu,
      // The bilingual fields are both required; a shop that only types one name should not be
      // made to type it twice.
      nameUz: String(data.nameUz ?? '').trim() || nameRu,
      active: true,
      storeId: config?.storeId ?? null,
      debtDueDate: data.debtDueDate ? new Date(data.debtDueDate) : null,
    },
  });

  return serializeDebtor(debtor);
}

export interface DebtorEdit {
  nameRu?: string;
  nameUz?: string;
  phone?: string;
  debtDueDate?: string | null;
}

export async function updateDebtor(id: string, data: DebtorEdit) {
  const prisma = getPrismaClient();

  const existing = await prisma.user.findUnique({ where: { id } });
  if (!existing) throw new Error('debtors.errors.not_found');

  // Name and phone belong to whoever owns the account. For a customer that is this screen; for a
  // cashier it is the Users screen, and renaming a colleague from the debtors list would be a
  // surprising way to edit their record — worse, it would rename the account they sign in with.
  // The due date is debt business either way.
  const identityEditable = existing.role === 'CLIENT';

  const update: Record<string, unknown> = {};
  if (data.nameRu && identityEditable) update.nameRu = data.nameRu.trim();
  if (data.nameUz && identityEditable) update.nameUz = data.nameUz.trim();
  if (data.phone && identityEditable) update.phone = data.phone.replace(/\D/g, '');
  // A customer's identity is edited here, so it has to reach the server before a pull may
  // overwrite it. The due date rides with the balance, which is always sent.
  if ('nameRu' in update || 'nameUz' in update || 'phone' in update) {
    update.synced = false;
  }
  if (data.debtDueDate !== undefined) {
    update.debtDueDate = data.debtDueDate ? new Date(data.debtDueDate) : null;
  }

  const debtor = await prisma.user.update({ where: { id }, data: update });
  return serializeDebtor(debtor);
}

/** The ledger behind one balance, newest first, with the stored total and the derived one. */
export async function debtorLedger(userId: string) {
  const prisma = getPrismaClient();

  const debtor = await prisma.user.findUnique({ where: { id: userId } });
  if (!debtor) throw new Error('debtors.errors.not_found');

  const transactions = await prisma.debtTransaction.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: 200,
  });

  return {
    debtor: serializeDebtor(debtor),
    // Both figures, deliberately: they are written together and should agree, and showing the
    // ledger's own sum is what turns "should" into something the screen can actually check.
    balance: num(debtor.debt),
    ledgerBalance: await recomputeBalance(prisma, userId),
    transactions: transactions.map(serializeTxn),
    // Whether a payment here fiscalizes what it pays off — this terminal's device decides, so a
    // satellite asks before a payoff exactly when its main would issue the receipts. Imported
    // lazily: the fiscal service starts the app logger on import (tasks/lessons.md).
    fiscalEnabled: await import('../fiscal/regos-vcr-service')
      .then(({ regosVcrService }) => regosVcrService.getConfig())
      .then((c: { enabled?: boolean }) => Boolean(c?.enabled))
      .catch(() => false),
  };
}

/** The credit sales this person has not finished paying for, oldest first. */
export async function unpaidSales(userId: string) {
  const prisma = getPrismaClient();

  const charges = await prisma.debtTransaction.findMany({
    where: { userId, type: 'CHARGE', settledAt: null },
    orderBy: { createdAt: 'asc' },
  });
  type SaleRow = { id: string; receiptNumber: string };
  const sales = (await prisma.sale.findMany({
    where: {
      id: { in: charges.map((c: { saleId: string | null }) => c.saleId).filter(Boolean) },
    },
    select: { id: true, receiptNumber: true, finalAmount: true, createdAt: true },
  })) as SaleRow[];
  const byId = new Map(sales.map((s) => [s.id, s]));

  return charges.map(
    (c: { id: string; saleId: string | null; amount: unknown; createdAt: Date }) => ({
      chargeId: c.id,
      saleId: c.saleId,
      amount: num(c.amount),
      createdAt: c.createdAt,
      receiptNumber: c.saleId ? (byId.get(c.saleId)?.receiptNumber ?? null) : null,
    }),
  );
}

/**
 * One receipt put on this person's tab, with its lines — the history a debtor's page unfolds.
 * Only a sale charged to them: this is not a way to read any receipt by id.
 */
export async function debtorSale(userId: string, saleId: string) {
  const sale = await getPrismaClient().sale.findFirst({
    where: { id: saleId, debtUserId: userId },
    include: { items: true },
  });
  if (!sale) throw new Error('debtors.errors.not_found');
  return sale;
}

export interface DebtPayment {
  userId: string;
  amount: number;
  paymentMethod: string;
  note?: string;
  fiscalize?: boolean;
}

/**
 * Take money off a debt.
 *
 * Three things happen, and the order matters. The ledger row and the balance move together in one
 * transaction. Cash lands in the drawer of `terminalId` — the till it was paid at — as a shift
 * PAY_IN, because that is the only way an X/Z report can account for money that arrived outside a
 * sale. And every credit sale the payment finished paying for is fiscalized now — the receipt
 * REGOS never saw at the counter.
 *
 * `fiscalize: false` skips that last step: the till asks when a payment clears the whole balance,
 * and the shop may choose not to issue the receipts. Those sales stay DEFERRED_DEBT, which no
 * retry sweep selects, so nothing fiscalizes them later behind the cashier's back.
 */
export async function recordDebtPayment(data: DebtPayment, staffId: string, terminalId: string) {
  const prisma = getPrismaClient();

  const amount = Math.abs(Number(data.amount) || 0);
  if (amount <= 0) throw new Error('debtors.errors.amount_required');

  const debtor = await prisma.user.findUnique({ where: { id: data.userId } });
  if (!debtor) throw new Error('debtors.errors.not_found');

  const tender = String(data.paymentMethod || 'cash').toLowerCase();

  const settledSales: string[] = await prisma.$transaction(async (tx: typeof prisma) => {
    await tx.debtTransaction.create({
      data: {
        userId: data.userId,
        type: 'PAYMENT',
        amount: signedAmount('PAYMENT', amount),
        paymentMethod: tender.toUpperCase(),
        note: data.note ?? null,
        createdBy: staffId,
      },
    });
    await tx.user.update({
      where: { id: data.userId },
      data: { debt: { decrement: amount } },
    });
    // After the row above is written: the allocator reads the ledger, so the payment it is
    // settling with is the one just recorded.
    return allocatePayment(tx, data.userId);
  });

  // Cash paid against a debt is money in the till that belongs to no sale in this shift. Recording
  // it as a PAY_IN is what keeps the drawer count right — the same movement a cashier would
  // otherwise have to enter by hand. A card payoff settles to the bank and must not touch the
  // drawer.
  if (isCashTender(tender)) {
    try {
      const shift = await currentShift(terminalId);
      if (shift) {
        await addShiftMovement({
          smenaId: shift.id,
          type: 'PAY_IN',
          amount,
          note: `Долг: ${debtor.nameRu}`,
        });
      }
    } catch (e) {
      console.error('[debtors] could not record the payment in the shift:', e);
    }
  }

  // Now that they have paid for them, those receipts can be fiscalized — unless the shop chose not
  // to.
  if (data.fiscalize !== false) {
    for (const saleId of settledSales) {
      await fiscalizeSettledSale(saleId, tender);
    }
  }

  const updated = await prisma.user.findUnique({ where: { id: data.userId } });
  return { debtor: serializeDebtor(updated), settledSales };
}

/**
 * Correct a balance by hand — writing off a debt, or fixing a mistake.
 *
 * Signed as given, since that is the point: ADJUSTMENT is the only type that can move a balance in
 * either direction. It never fiscalizes anything: forgiving a debt is not the customer paying for
 * those goods.
 */
export async function adjustDebt(
  data: { userId: string; amount: number; note?: string },
  adminId: string,
) {
  const prisma = getPrismaClient();

  const amount = signedAmount('ADJUSTMENT', Number(data.amount) || 0);
  if (amount === 0) throw new Error('debtors.errors.amount_required');

  await prisma.$transaction(async (tx: typeof prisma) => {
    await tx.debtTransaction.create({
      data: {
        userId: data.userId,
        type: 'ADJUSTMENT',
        amount,
        note: data.note ?? null,
        createdBy: adminId,
      },
    });
    await tx.user.update({
      where: { id: data.userId },
      data: { debt: { increment: amount } },
    });
  });

  const updated = await prisma.user.findUnique({ where: { id: data.userId } });
  return serializeDebtor(updated);
}
