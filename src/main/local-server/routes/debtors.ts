import { db } from '../helpers';
import { notFound, type Route } from '../router';

/**
 * Nasiya, read-only, for the dashboard this terminal serves on the shop's LAN.
 *
 * The mirror image of the VPS's `/debtors`: same paths, same shape, so the dashboard code does
 * not care which backend answered — and an OFFLINE_ONLY store, whose terminal never talks to a
 * server at all, gets the same page. Read-only here for a different reason than on the VPS: the
 * POS app on this very machine is where a payment is taken, with the drawer and the fiscal
 * device attached to it.
 */

const DEBTOR_FIELDS = {
  id: true,
  phone: true,
  nameRu: true,
  nameUz: true,
  role: true,
  debt: true,
  debtDueDate: true,
  createdAt: true,
} as const;

export const debtorRoutes: Route[] = [
  {
    method: 'GET',
    path: '/debtors',
    roles: ['ADMIN', 'SUPER_ADMIN'],
    handler: async ({ query }) => {
      const search = typeof query.search === 'string' ? query.search.trim() : '';
      const withDebtOnly = query.withDebtOnly === 'true';

      return db().user.findMany({
        where: {
          active: true,
          // Mirrors debtors:list and the VPS: the role filter applies only when the list is not
          // already narrowed to people who owe, so staff debt is never hidden by a role.
          ...(withDebtOnly ? { debt: { gt: 0 } } : { role: 'CLIENT' }),
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
        select: DEBTOR_FIELDS,
        orderBy: [{ debt: 'desc' }, { nameRu: 'asc' }],
        take: 200,
      });
    },
  },

  {
    method: 'GET',
    path: '/debtors/:id',
    roles: ['ADMIN', 'SUPER_ADMIN'],
    handler: async ({ params }) => {
      const debtor = await db().user.findUnique({
        where: { id: params.id },
        select: DEBTOR_FIELDS,
      });
      if (!debtor) throw notFound('Debtor not found');

      const transactions = await db().debtTransaction.findMany({
        where: { userId: params.id },
        orderBy: { createdAt: 'desc' },
        take: 200,
      });

      // The credit sales behind the CHARGE rows, with their lines — one query, not one per row.
      const saleIds = transactions
        .map((t: { saleId: string | null }) => t.saleId)
        .filter((id: string | null): id is string => Boolean(id));
      const sales = saleIds.length
        ? await db().sale.findMany({
            where: { id: { in: saleIds } },
            select: {
              id: true,
              receiptNumber: true,
              finalAmount: true,
              debtAmount: true,
              createdAt: true,
              items: {
                select: { productName: true, quantity: true, unitPrice: true, subtotal: true },
              },
            },
          })
        : [];

      return { debtor, transactions, sales };
    },
  },
];
