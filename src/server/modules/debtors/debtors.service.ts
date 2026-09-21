import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma, UserRole } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { SyncDebtTransactionDto } from './dto/sync-debt.dto';

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
export class DebtorsService {
  private readonly logger = new Logger(DebtorsService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * Mirror a batch of ledger rows up from a terminal.
   *
   * Idempotent on the till's own row id, like the shift sync: a retry after a dropped response
   * updates the same row rather than charging the customer twice.
   */
  async syncFromTerminal(storeId: string, rows: SyncDebtTransactionDto[]) {
    let synced = 0;
    let skipped = 0;

    for (const row of rows) {
      try {
        // A row whose user never reached the server would violate the FK and take the whole
        // batch down with it. Skipping one is recoverable — the terminal keeps it unsynced and
        // sends it again once the user upload has landed.
        const user = await this.prisma.user.findUnique({
          where: { id: row.userId },
          select: { id: true },
        });
        if (!user) {
          skipped++;
          continue;
        }

        const data = {
          storeId,
          userId: row.userId,
          type: row.type,
          amount: new Prisma.Decimal(row.amount),
          paymentMethod: row.paymentMethod ?? null,
          saleId: row.saleId ?? null,
          settledAt: row.settledAt ? new Date(row.settledAt) : null,
          dueDate: row.dueDate ? new Date(row.dueDate) : null,
          note: row.note ?? null,
          createdBy: row.createdBy,
          createdAt: new Date(row.createdAt),
        };

        await this.prisma.debtTransaction.upsert({
          where: { id: row.id },
          create: { id: row.id, ...data },
          update: data,
        });
        synced++;
      } catch (err) {
        this.logger.error(
          `Failed to sync debt transaction ${row.id}: ${err instanceof Error ? err.message : String(err)}`,
        );
        skipped++;
      }
    }

    return { synced, skipped };
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
