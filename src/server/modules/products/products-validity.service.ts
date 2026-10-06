import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { InvalidProductReportDto } from './dto/report-invalid.dto';

/**
 * Product.isValid as tills report it: REGOS:VCR rejected a receipt line for the product, so it is
 * invalid until the next inventory arrival (InventoryService sets it back to true).
 */
@Injectable()
export class ProductsValidityService {
  private readonly logger = new Logger(ProductsValidityService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Records the rejections a till saw. Returns the barcodes it is done with, so the till can drop
   * them from its outbox — recorded, superseded, or for a product this store does not have.
   *
   * A report is superseded when an arrival for the product was recorded after the rejection: a
   * till that was offline for a day must not mark a freshly delivered batch invalid. Idempotent —
   * a retried report finds the product already invalid and changes nothing.
   */
  async reportInvalid(
    storeId: string,
    items: InvalidProductReportDto[],
  ): Promise<{ done: string[] }> {
    const done: string[] = [];

    for (const item of items) {
      try {
        const product = await this.prisma.product.findUnique({
          where: { storeId_barcode: { storeId, barcode: item.barcode } },
          select: { id: true },
        });
        if (!product) {
          done.push(item.barcode);
          continue;
        }

        const at = new Date(item.at);
        const newerArrival = await this.prisma.inventoryArrival.findFirst({
          where: { storeId, productId: product.id, createdAt: { gt: at } },
          select: { id: true },
        });
        if (!newerArrival) {
          // Only a real change bumps updatedAt — that is what sends the product down to every
          // till, and a retried report should not trigger a store-wide re-pull.
          await this.prisma.product.updateMany({
            where: { id: product.id, isValid: true },
            data: { isValid: false },
          });
        }
        done.push(item.barcode);
      } catch (err) {
        this.logger.error(
          `Failed to record invalid product ${item.barcode}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    return { done };
  }
}
