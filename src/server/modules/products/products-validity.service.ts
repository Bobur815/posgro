import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { InvalidProductReportDto } from './dto/report-invalid.dto';
import type { ProductValidityReportDto } from './dto/report-validity.dto';

/**
 * Product.isValid as tills report it: false once REGOS:VCR rejected a receipt line for the
 * product, true again once a receipt with it was fiscalised. Tills report late (offline) and
 * retry, so the newest report wins (Product.validityAt) and a repeated one changes nothing.
 */
@Injectable()
export class ProductsValidityService {
  private readonly logger = new Logger(ProductsValidityService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Records what tills saw. Returns the barcodes it is done with, so the till can drop them from
   * its outbox — recorded, older than what is already known, or for a product this store does not
   * have. A barcode is done only when every report for it in the batch was.
   */
  async reportValidity(
    storeId: string,
    items: ProductValidityReportDto[],
  ): Promise<{ done: string[] }> {
    const seen = new Set<string>();
    const failed = new Set<string>();

    // Oldest first: a batch holding a rejection and a later fiscalisation ends valid.
    const ordered = [...items].sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
    for (const item of ordered) {
      seen.add(item.barcode);
      try {
        await this.apply(storeId, item);
      } catch (err) {
        failed.add(item.barcode);
        this.logger.error(
          `Failed to record validity of ${item.barcode}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    return { done: [...seen].filter((b) => !failed.has(b)) };
  }

  /** The endpoint tills before /products/validity call: rejections only. */
  async reportInvalid(
    storeId: string,
    items: InvalidProductReportDto[],
  ): Promise<{ done: string[] }> {
    return this.reportValidity(
      storeId,
      items.map((i) => ({ ...i, valid: false })),
    );
  }

  private async apply(storeId: string, item: ProductValidityReportDto): Promise<void> {
    const product = await this.prisma.product.findUnique({
      where: { storeId_barcode: { storeId, barcode: item.barcode } },
      select: { id: true, isValid: true, validityAt: true, updatedAt: true },
    });
    if (!product) return;

    const at = new Date(item.at);
    if (product.validityAt && product.validityAt >= at) return; // a newer report already stands

    // Guarded on validityAt too, so a report written in between is never overwritten by an older one.
    const where = {
      id: product.id,
      OR: [{ validityAt: null }, { validityAt: { lt: at } }],
    };
    if (product.isValid !== item.valid) {
      // A real change bumps updatedAt — that is what sends the product down to every till.
      await this.prisma.product.updateMany({
        where,
        data: { isValid: item.valid, validityAt: at },
      });
    } else {
      // Same answer, newer time: keep updatedAt, or every fiscalised receipt would make every
      // till re-pull its products.
      await this.prisma.product.updateMany({
        where,
        data: { validityAt: at, updatedAt: product.updatedAt },
      });
    }
  }
}
