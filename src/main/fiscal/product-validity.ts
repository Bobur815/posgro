// Product.isValid on the till: REGOS:VCR rejected a receipt line for the product, so it is invalid
// until its next inventory arrival. Marked here at once, and queued for the VPS
// (sync/product-validity-sync.ts), which holds the store-wide answer every till pulls back.

import { randomUUID } from 'crypto';
import { getPrismaClient } from '../database/sqlite-client';
import { VcrError } from './regos-vcr-client';

const ERR_MXIK_CHECK = 705511; // VCR: "Ошибка проверки МХИК (ИКПУ) товара"

/**
 * Not the product's fault, though REGOS words them like product faults: the cashier did not scan
 * the marking code, or scanned one already sold. A new delivery would not change either.
 */
const NOT_THE_PRODUCT = /не задан|не отсканирован|дублик|уже (?:существует|использ|продан)/i;

/** What REGOS says when the product's own data is wrong — or its batch is out of circulation. */
const PRODUCT_FAULT =
  /ставка\s*ндс|икпу|мхик|icps|упаковк|package|недействител|вне оборот|выведен[а-я]* из оборота/i;

/** Whether a REGOS rejection is about a product on the receipt (and so worth blaming one). */
export function isProductRejection(e: unknown): e is VcrError {
  if (!(e instanceof VcrError) || e.code === 0) return false;
  const d = e.description || '';
  if (NOT_THE_PRODUCT.test(d)) return false;
  return e.code === ERR_MXIK_CHECK || PRODUCT_FAULT.test(d);
}

export interface RejectedProduct {
  productId: number;
  barcode: string;
}

/**
 * Marks the products invalid here and queues one report each for the VPS. Never throws: a failed
 * write costs the flag, never the sale's own failure handling.
 */
export async function markProductsInvalid(
  products: RejectedProduct[],
  code: number,
  at: Date = new Date(),
): Promise<void> {
  if (products.length === 0) return;
  const prisma = getPrismaClient();
  try {
    await prisma.product.updateMany({
      where: { id: { in: products.map((p) => p.productId) } },
      data: { isValid: false },
    });
    const invalidatedAt = at.toISOString();
    for (const p of products) {
      await prisma.$executeRaw`
        INSERT INTO product_invalid_reports (id, barcode, invalidated_at, error_code)
        VALUES (${randomUUID()}, ${p.barcode}, ${invalidatedAt}, ${code})
      `;
    }
  } catch (err) {
    console.error(
      '[fiscal] could not mark products invalid:',
      err instanceof Error ? err.message : err,
    );
  }
}
