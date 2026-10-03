import { Injectable, Logger, NotFoundException, OnApplicationBootstrap } from '@nestjs/common';
import { Prisma, UserRole } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { SyncDebtTransactionDto } from './dto/sync-debt.dto';

/**
 * Off unless DEBT_BALANCE_FROM_LEDGER=true: the stored balance then follows the ledger the tills
 * replicate, and the `debt` figure a till uploads with its users is ignored (UsersService).
 */
export const balanceFromLedger = (): boolean => process.env.DEBT_BALANCE_FROM_LEDGER === 'true';

type LedgerSettlement = {
  settledAt: Date | null;
  settleTender: string | null;
  settleFiscalize: boolean | null;
  originTerminalId: string | null;
  voidedAt: Date | null;
  voidedBy: string | null;
  voidReason: string | null;
};

/**
 * What an incoming copy of a ledger row may change on the stored one — or null for nothing.
 *
 * Everything a row says about money (who, type, amount, sale) is fixed when it is written, so a
 * re-send can only add what happened since: the charge got settled, an admin voided the row, or
 * the stored row lacked its origin. `settledAt` is never cleared and the earliest settlement wins,
 * so two tills that both settled the same charge offline agree on one answer whichever syncs last.
 * A void is likewise set once and never undone.
 *
 * The POS applies the same rule to rows it pulls (src/main/sync/debt-ledger-sync.ts).
 */
export function mergeLedgerRow(
  stored: LedgerSettlement,
  incoming: LedgerSettlement,
): Partial<LedgerSettlement> | null {
  const patch: Partial<LedgerSettlement> = {};

  if (
    incoming.settledAt &&
    (!stored.settledAt || incoming.settledAt.getTime() < stored.settledAt.getTime())
  ) {
    patch.settledAt = incoming.settledAt;
    patch.settleTender = incoming.settleTender;
    patch.settleFiscalize = incoming.settleFiscalize;
  }
  // A void is final: the first one recorded stands, and nothing un-voids a row.
  if (!stored.voidedAt && incoming.voidedAt) {
    patch.voidedAt = incoming.voidedAt;
    patch.voidedBy = incoming.voidedBy;
    patch.voidReason = incoming.voidReason;
  }
  if (!stored.originTerminalId && incoming.originTerminalId) {
    patch.originTerminalId = incoming.originTerminalId;
  }

  return Object.keys(patch).length > 0 ? patch : null;
}

/**
 * Nasiya on the server: a mirror, never a source.
 *
 * Every debt is taken on and paid off at a till — that is where the customer and the money are —
 * so this module only ever reads what the terminals have reported, and the dashboard's debtor
 * page is read-only by design. Writing a payment here would produce a balance no till agrees
 * with, and the till would win the next time it synced.
 *
 * Two things arrive separately and must not be confused: the balance rides up with the user row
 * (`users.debt`, see UsersService.upsertBulk), while the history arrives here. A store whose
 * terminals are offline shows a stale balance and a short history, which is honest.
 */
@Injectable()
export class DebtorsService implements OnApplicationBootstrap {
  private readonly logger = new Logger(DebtorsService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * Under DEBT_BALANCE_FROM_LEDGER, make every stored balance its ledger's sum once the API is up.
   *
   * Turning the flag on changes no stored balance by itself: syncFromTerminal re-derives only the
   * people whose rows arrive afterwards, so anyone without a new operation kept the total the last
   * till uploaded — on store 1234 that was one till's charges only. The tills do the same on their
   * side when they first see ledger mode (debt-ledger-sync.ts alignBalances).
   *
   * Safe to run on every start: the result is always the ledger's sum, so a second run corrects
   * nothing. A failure is logged and never stops the API from starting.
   */
  async onApplicationBootstrap(): Promise<void> {
    if (!balanceFromLedger()) return;
    try {
      const { checked, corrected, withoutLedger } = await this.alignAllBalances();
      this.logger.log(
        `Ledger balances: ${corrected} of ${checked} corrected` +
          (withoutLedger > 0 ? `; ${withoutLedger} balance(s) with no ledger rows left as they are` : ''),
      );
    } catch (err) {
      this.logger.error(`Ledger balance alignment failed: ${err instanceof Error ? err.message : err}`);
    }
  }

  /**
   * Every store: set each person's balance to their ledger's sum, where it differs.
   *
   * Only people with ledger rows. A balance with no rows behind it predates the ledger (or was
   * typed in by hand), and its ledger sum of 0 would be a guess that wipes a real debt — the tills
   * follow the same rule. Those are counted, and `/debtors/ledger/drift` lists them.
   */
  async alignAllBalances(): Promise<{ checked: number; corrected: number; withoutLedger: number }> {
    const sums = await this.prisma.debtTransaction.groupBy({
      by: ['storeId', 'userId'],
      // A voided row is history, not money.
      where: { voidedAt: null },
      _sum: { amount: true },
    });
    // Everyone with any row, voided ones included: a person whose only row was voided owes 0.
    const withRows = await this.prisma.debtTransaction.groupBy({ by: ['storeId', 'userId'] });
    const sumOf = new Map(sums.map((r) => [`${r.storeId}:${r.userId}`, r._sum.amount ?? new Prisma.Decimal(0)]));

    const users = await this.prisma.user.findMany({
      where: { OR: [{ debt: { not: 0 } }, { id: { in: withRows.map((r) => r.userId) } }] },
      select: { id: true, storeId: true, debt: true },
    });
    const hasRows = new Set(withRows.map((r) => `${r.storeId}:${r.userId}`));

    let corrected = 0;
    let withoutLedger = 0;
    for (const u of users) {
      const key = `${u.storeId}:${u.id}`;
      if (!hasRows.has(key)) {
        withoutLedger++;
        continue;
      }
      const ledger = sumOf.get(key) ?? new Prisma.Decimal(0);
      if (u.debt.equals(ledger)) continue;
      await this.prisma.user.updateMany({ where: { id: u.id, storeId: u.storeId }, data: { debt: ledger } });
      this.logger.log(`Ledger balance store=${u.storeId} user=${u.id}: ${u.debt.toString()} → ${ledger.toString()}`);
      corrected++;
    }
    return { checked: users.length - withoutLedger, corrected, withoutLedger };
  }

  /**
   * Mirror a batch of ledger rows up from a terminal.
   *
   * Idempotent on the till's own row id, like the shift sync: a retry after a dropped response
   * changes nothing rather than charging the customer twice.
   *
   * With several tills on one store a row can arrive more than once and from more than one place:
   * T1 writes a charge, T2 settles it and sends it back up, and T1 may re-send its own stale copy
   * afterwards. So an existing row is merged, never overwritten — see `mergeLedgerRow`.
   *
   * `syncedIds` names exactly the rows taken. `synced` stays for terminals that only read the
   * count; it was always the count, never a prefix length, which is what lost rows before.
   */
  async syncFromTerminal(storeId: string, rows: SyncDebtTransactionDto[]) {
    let skipped = 0;
    const syncedIds: string[] = [];
    const touchedUsers = new Set<string>();

    for (const row of rows) {
      try {
        // A row whose user never reached the server would violate the FK and take the whole
        // batch down with it. Skipping one is recoverable — the terminal keeps it unsynced and
        // sends it again once the user upload has landed. A user of another store is refused
        // outright: a till only ever writes its own store's ledger.
        const user = await this.prisma.user.findUnique({
          where: { id: row.userId },
          select: { id: true, storeId: true },
        });
        if (!user || user.storeId !== storeId) {
          skipped++;
          continue;
        }

        const existing = await this.prisma.debtTransaction.findUnique({
          where: { id: row.id },
        });
        if (existing && existing.storeId !== storeId) {
          skipped++;
          continue;
        }

        const incoming = {
          settledAt: row.settledAt ? new Date(row.settledAt) : null,
          settleTender: row.settleTender ?? null,
          settleFiscalize: row.settleFiscalize ?? null,
          originTerminalId: row.originTerminalId ?? null,
          voidedAt: row.voidedAt ? new Date(row.voidedAt) : null,
          voidedBy: row.voidedBy ?? null,
          voidReason: row.voidReason ?? null,
        };

        if (!existing) {
          await this.prisma.debtTransaction.create({
            data: {
              id: row.id,
              storeId,
              userId: row.userId,
              type: row.type,
              amount: new Prisma.Decimal(row.amount),
              paymentMethod: row.paymentMethod ?? null,
              saleId: row.saleId ?? null,
              dueDate: row.dueDate ? new Date(row.dueDate) : null,
              note: row.note ?? null,
              createdBy: row.createdBy,
              createdAt: new Date(row.createdAt),
              ...incoming,
            },
          });
          touchedUsers.add(row.userId);
        } else {
          const patch = mergeLedgerRow(existing, incoming);
          // Only a real change is written: every write moves updatedAt, and every till would
          // then pull the row again for nothing.
          if (patch) {
            await this.prisma.debtTransaction.update({
              where: { id: row.id },
              data: patch,
            });
            touchedUsers.add(row.userId);
          }
        }
        syncedIds.push(row.id);
      } catch (err) {
        this.logger.error(
          `Failed to sync debt transaction ${row.id}: ${err instanceof Error ? err.message : String(err)}`,
        );
        skipped++;
      }
    }

    if (balanceFromLedger() && touchedUsers.size > 0) {
      await this.recomputeBalances(storeId, [...touchedUsers]);
    }

    return { synced: syncedIds.length, skipped, syncedIds };
  }

  /**
   * Ledger rows changed since a cursor, oldest change first — what a till pulls to learn what the
   * store's other tills wrote.
   *
   * The cursor is (updatedAt, id) in server time, so ties on one millisecond are not skipped at a
   * page boundary and a till's clock never matters. A till re-reading a few rows is harmless: the
   * merge on its side is idempotent, the same as the one here.
   */
  async pullLedger(
    storeId: string,
    cursor: { updatedAfter?: Date; afterId?: string },
    limit = 500,
  ) {
    const take = Math.min(Math.max(limit, 1), 1000);
    const { updatedAfter, afterId } = cursor;

    const rows = await this.prisma.debtTransaction.findMany({
      where: {
        storeId,
        ...(updatedAfter
          ? {
              OR: [
                { updatedAt: { gt: updatedAfter } },
                ...(afterId ? [{ updatedAt: updatedAfter, id: { gt: afterId } }] : []),
              ],
            }
          : {}),
      },
      orderBy: [{ updatedAt: 'asc' }, { id: 'asc' }],
      take,
    });

    const last = rows[rows.length - 1];
    return {
      rows,
      // Tills derive their own balance from the ledger only when the server does: one switch for
      // the whole store, so the server and its tills never disagree about who owns the figure.
      balanceFromLedger: balanceFromLedger(),
      // Null once the page was not full: the till is caught up.
      nextCursor:
        rows.length === take && last
          ? { updatedAfter: last.updatedAt.toISOString(), afterId: last.id }
          : null,
    };
  }

  /**
   * Set `users.debt` to what the ledger adds up to, for these people.
   *
   * Only under DEBT_BALANCE_FROM_LEDGER. Until then the figure each till uploads stands, exactly
   * as before — and `ledgerDrift` says whether switching over would move anyone's balance.
   */
  async recomputeBalances(storeId: string, userIds: string[]) {
    const sums = await this.prisma.debtTransaction.groupBy({
      by: ['userId'],
      // A voided row is history, not money.
      where: { storeId, userId: { in: userIds }, voidedAt: null },
      _sum: { amount: true },
    });
    const byUser = new Map(sums.map((s) => [s.userId, s._sum.amount ?? new Prisma.Decimal(0)]));

    for (const userId of userIds) {
      await this.prisma.user.updateMany({
        where: { id: userId, storeId },
        data: { debt: byUser.get(userId) ?? new Prisma.Decimal(0) },
      });
    }
  }

  /**
   * Read-only: everyone whose stored balance differs from their ledger's sum.
   *
   * Run before turning DEBT_BALANCE_FROM_LEDGER on. A difference means a ledger row never reached
   * the server (or a balance was overwritten by another till) — the flag would make the ledger's
   * figure the balance, so each one wants a look first.
   */
  async ledgerDrift(storeId: string) {
    const users = await this.prisma.user.findMany({
      where: { storeId },
      select: { id: true, phone: true, nameRu: true, nameUz: true, debt: true },
    });
    const sums = await this.prisma.debtTransaction.groupBy({
      by: ['userId'],
      where: { storeId, voidedAt: null },
      _sum: { amount: true },
    });
    const byUser = new Map(sums.map((s) => [s.userId, s._sum.amount ?? new Prisma.Decimal(0)]));

    return users
      .map((u) => {
        const ledger = byUser.get(u.id) ?? new Prisma.Decimal(0);
        return { ...u, ledger, drift: u.debt.minus(ledger) };
      })
      .filter((u) => !u.drift.isZero());
  }

  /** Everyone in this store who owes something, plus every customer record. */
  async findAll(storeId: string, opts: { withDebtOnly?: boolean; search?: string } = {}) {
    const search = opts.search?.trim();

    return this.prisma.user.findMany({
      where: {
        storeId,
        active: true,
        // Mirrors the terminal's rule exactly (see debtors:list): the role filter applies only
        // when the list is not already narrowed to people who owe, so a cashier's debt can never
        // be hidden by their being staff.
        ...(opts.withDebtOnly ? { debt: { gt: 0 } } : { role: UserRole.CLIENT }),
        ...(search
          ? {
              OR: [
                { nameRu: { contains: search, mode: 'insensitive' as const } },
                { nameUz: { contains: search, mode: 'insensitive' as const } },
                { phone: { contains: search } },
              ],
            }
          : {}),
      },
      select: {
        id: true,
        phone: true,
        nameRu: true,
        nameUz: true,
        role: true,
        debt: true,
        debtDueDate: true,
        createdAt: true,
      },
      orderBy: [{ debt: 'desc' }, { nameRu: 'asc' }],
      take: 200,
    });
  }

  /**
   * Nasiya paid back in a period — the receipts summary adds it to the tender it arrived in.
   * Voided rows are left out, like every balance and report. Amounts stay negative, as stored.
   */
  async paymentsInRange(storeId: string, range: { from?: Date; to?: Date } = {}) {
    const createdAt: Prisma.DateTimeFilter = {};
    if (range.from) createdAt.gte = range.from;
    if (range.to) createdAt.lte = range.to;
    return this.prisma.debtTransaction.findMany({
      where: {
        storeId,
        type: 'PAYMENT',
        voidedAt: null,
        ...(range.from || range.to ? { createdAt } : {}),
      },
      select: { id: true, userId: true, amount: true, paymentMethod: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
      take: 5000,
    });
  }

  /** One person's balance and the history behind it, newest first. */
  async findOne(storeId: string, userId: string) {
    const debtor = await this.prisma.user.findFirst({
      where: { id: userId, storeId },
      select: {
        id: true,
        phone: true,
        nameRu: true,
        nameUz: true,
        role: true,
        debt: true,
        debtDueDate: true,
        createdAt: true,
      },
    });
    if (!debtor) throw new NotFoundException('Debtor not found');

    const transactions = await this.prisma.debtTransaction.findMany({
      where: { storeId, userId },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });

    // The credit sales behind the CHARGE rows, with their lines — what the dashboard shows when
    // an entry is expanded. Fetched in one query rather than per row.
    const saleIds = transactions
      .map((t) => t.saleId)
      .filter((id): id is string => Boolean(id));
    const sales = saleIds.length
      ? await this.prisma.sale.findMany({
          where: { id: { in: saleIds }, storeId },
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
  }
}
