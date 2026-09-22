import { getPrismaClient } from '../database/sqlite-client';

/**
 * The people a receipt can be put on the tab of, as the debtor list and the POS picker show them.
 *
 * Shared by `debtors:list` (this till's own database) and the main's `GET /terminal/debtors`,
 * which is where a satellite gets them: its database holds no users, so it asks the main — whose
 * ids are the ones a credit sale committed there must name.
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
