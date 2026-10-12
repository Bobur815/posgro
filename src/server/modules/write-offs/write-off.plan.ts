import { Prisma } from '@prisma/client';
import type { WriteOffReason } from './dto/create-write-off.dto';

/** The product fields a write-off line snapshots and checks against. */
export interface WriteOffProduct {
  id: number;
  nameRu: string;
  nameUz: string;
  barcode: string;
  unit: string;
  stock: Prisma.Decimal;
  cost: Prisma.Decimal | null;
}

export interface WriteOffRequest {
  reason: WriteOffReason;
  note?: string | null;
  items: { productId: number; quantity: number }[];
}

export interface PlannedLine {
  productId: number;
  productName: string;
  productNameUz: string;
  barcode: string;
  unit: string;
  quantity: Prisma.Decimal;
  cost: Prisma.Decimal | null;
}

export type WriteOffPlan =
  | { ok: true; lines: PlannedLine[]; totalValue: Prisma.Decimal; note: string | null }
  | { ok: false; error: WriteOffRefusal };

/** Why a write-off was refused. `product` names the line at fault, for the message. */
export type WriteOffRefusal =
  | { code: 'NOTE_REQUIRED' }
  | { code: 'DUPLICATE_LINE'; productId: number }
  | { code: 'UNKNOWN_PRODUCT'; productId: number }
  | { code: 'NOT_POSITIVE'; productId: number }
  | { code: 'EXCEEDS_STOCK'; productId: number; product: string; stock: string; quantity: string };

/**
 * Check a write-off request and turn it into the lines and total to write. Pure, so the rules are
 * tested without a database — and the till's port (src/main/write-offs) follows the same ones.
 *
 * - "Other" must say what it is: a note is required.
 * - One line per product; a product listed twice is a mistake to fix in the form, not to sum.
 * - A line may not take more than the product's current stock (stock never goes negative here).
 * - The value is at cost, as recorded on the product now; a product without a cost adds nothing.
 */
export function planWriteOff(
  request: WriteOffRequest,
  products: readonly WriteOffProduct[],
): WriteOffPlan {
  const note = request.note?.trim() || null;
  if (request.reason === 'OTHER' && !note) return { ok: false, error: { code: 'NOTE_REQUIRED' } };

  const byId = new Map(products.map((p) => [p.id, p]));
  const seen = new Set<number>();
  const lines: PlannedLine[] = [];
  let totalValue = new Prisma.Decimal(0);

  for (const item of request.items) {
    if (seen.has(item.productId)) {
      return { ok: false, error: { code: 'DUPLICATE_LINE', productId: item.productId } };
    }
    seen.add(item.productId);

    const product = byId.get(item.productId);
    if (!product)
      return { ok: false, error: { code: 'UNKNOWN_PRODUCT', productId: item.productId } };

    const quantity = new Prisma.Decimal(item.quantity);
    if (quantity.lte(0)) {
      return { ok: false, error: { code: 'NOT_POSITIVE', productId: item.productId } };
    }
    if (quantity.gt(product.stock)) {
      return {
        ok: false,
        error: {
          code: 'EXCEEDS_STOCK',
          productId: product.id,
          product: product.nameRu,
          stock: product.stock.toString(),
          quantity: quantity.toString(),
        },
      };
    }

    if (product.cost) totalValue = totalValue.plus(product.cost.times(quantity));
    lines.push({
      productId: product.id,
      productName: product.nameRu,
      productNameUz: product.nameUz,
      barcode: product.barcode,
      unit: product.unit,
      quantity,
      cost: product.cost,
    });
  }

  return { ok: true, lines, totalValue: totalValue.toDecimalPlaces(2), note };
}

/** English message for a refusal, as the server's other 400s are. */
export function refusalMessage(error: WriteOffRefusal): string {
  switch (error.code) {
    case 'NOTE_REQUIRED':
      return 'A note is required when the reason is OTHER';
    case 'DUPLICATE_LINE':
      return `Product ${error.productId} is listed twice`;
    case 'UNKNOWN_PRODUCT':
      return `Product ${error.productId} not found`;
    case 'NOT_POSITIVE':
      return `Quantity for product ${error.productId} must be greater than zero`;
    case 'EXCEEDS_STOCK':
      return `Cannot write off ${error.quantity} of "${error.product}": only ${error.stock} in stock`;
  }
}
