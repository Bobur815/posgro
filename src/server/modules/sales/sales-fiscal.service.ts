import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { SyncFiscalStatusDto } from './dto/sync-fiscal.dto';

/**
 * The fiscal state of sales the server already has, as the tills report it.
 *
 * A sale reaches the server before it is fiscalized (the till does not hold the sale back for the
 * fiscal device), and a credit sale is only fiscalized when it is paid off — days later, possibly
 * with another tender. So the state arrives here separately, and repeatedly: idempotent, a
 * re-send writes the same values again.
 */
@Injectable()
export class SalesFiscalService {
  private readonly logger = new Logger(SalesFiscalService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * Returns the receipts it recorded. One the server does not have yet (its sale has not synced)
   * is left out, and the till sends it again next cycle.
   */
  async syncFromTerminal(storeId: string, rows: SyncFiscalStatusDto[]) {
    const synced: string[] = [];

    for (const row of rows) {
      try {
        const { count } = await this.prisma.sale.updateMany({
          where: { storeId, receiptNumber: row.receiptNumber },
          data: {
            fiscalStatus: row.fiscalStatus,
            fiscalizedAt: row.fiscalizedAt ? new Date(row.fiscalizedAt) : null,
            fiscalTender: row.fiscalTender ? row.fiscalTender.toLowerCase() : null,
          },
        });
        if (count > 0) synced.push(row.receiptNumber);
      } catch (err) {
        this.logger.error(
          `Failed to record fiscal status of ${row.receiptNumber}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    return { synced };
  }
}
