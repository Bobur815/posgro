import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { SyncSalePaymentsDto } from './dto/sync-payments.dto';

/**
 * The tenders of split-payment receipts (sales.payment_method = 'mixed'), as the tills report them.
 *
 * Idempotent: a receipt's lines are replaced as a whole, so a retry — or a resend after the till
 * edited the sale — leaves exactly what the till holds. Lines are kept even if their sale has not
 * synced yet; readers join on (store, receiptNumber) and simply find nothing until it does.
 */
@Injectable()
export class SalesPaymentsService {
  private readonly logger = new Logger(SalesPaymentsService.name);

  constructor(private prisma: PrismaService) {}

  /** Returns the receipts it recorded; one that failed is left out and the till sends it again. */
  async syncFromTerminal(storeId: string, rows: SyncSalePaymentsDto[]) {
    const synced: string[] = [];

    for (const row of rows) {
      // One line per tender: the till never sends two, but a duplicate must not trip the unique key.
      const byMethod = new Map<string, Prisma.Decimal>();
      for (const p of row.payments) {
        const prev = byMethod.get(p.method) ?? new Prisma.Decimal(0);
        byMethod.set(p.method, prev.plus(new Prisma.Decimal(p.amount)));
      }
      try {
        await this.prisma.$transaction([
          this.prisma.salePayment.deleteMany({
            where: { storeId, receiptNumber: row.receiptNumber },
          }),
          this.prisma.salePayment.createMany({
            data: [...byMethod].map(([method, amount]) => ({
              storeId,
              receiptNumber: row.receiptNumber,
              method,
              amount,
            })),
          }),
        ]);
        synced.push(row.receiptNumber);
      } catch (err) {
        this.logger.error(
          `Failed to record payments of ${row.receiptNumber}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    return { synced };
  }
}
