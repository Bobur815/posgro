import type { Prisma } from '../../generated/prisma-sqlite';
import { getPrismaNamespace } from '../database/sqlite-client';

/**
 * A port of `planWriteOff()` in `src/server/modules/write-offs/write-off.plan.ts`, for an
 * OFFLINE_ONLY store whose write-offs happen on the till. It could not be imported: that module
 * uses the PostgreSQL Prisma client, which does not belong in the Electron main bundle (the same
 * reason `local-server/stocktake-plan.ts` is a port). Same rules, same refusal codes, so the
 * dashboard shows the same messages whichever backend answered.
 */

export const WRITE_OFF_REASONS = ['EXPIRY', 'DAMAGE', 'OTHER'] as const;
export type WriteOffReason = (typeof WRITE_OFF_REASONS)[number];

type DecimalLike = Prisma.Decimal | string | number;

export interface WriteOffProduct {
  id: number;
  nameRu: string;
  nameUz: string;
  barcode: string;
  unit: string;
  stock: DecimalLike;
  cost: DecimalLike | null;
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

export type WriteOffRefusal =
  | { code: 'NOTE_REQUIRED' }
  | { code: 'DUPLICATE_LINE'; productId: number }
  | { code: 'UNKNOWN_PRODUCT'; productId: number }
  | { code: 'NOT_POSITIVE'; productId: number }
  | { code: 'EXCEEDS_STOCK'; productId: number; product: string; stock: string; quantity: string };

export type WriteOffPlan =
  | { ok: true; lines: PlannedLine[]; totalValue: Prisma.Decimal; note: string | null }
  | { ok: false; error: WriteOffRefusal };

export function planWriteOff(
  request: WriteOffRequest,
  products: readonly WriteOffProduct[],
): WriteOffPlan {
  const { Decimal } = getPrismaNamespace();
  const note = request.note?.trim() || null;
  if (request.reason === 'OTHER' && !note) return { ok: false, error: { code: 'NOTE_REQUIRED' } };

  const byId = new Map(products.map((p) => [p.id, p]));
  const seen = new Set<number>();
  const lines: PlannedLine[] = [];
  let totalValue = new Decimal(0);

  for (const item of request.items) {
    if (seen.has(item.productId)) {
      return { ok: false, error: { code: 'DUPLICATE_LINE', productId: item.productId } };
    }
    seen.add(item.productId);

    const product = byId.get(item.productId);
    if (!product)
      return { ok: false, error: { code: 'UNKNOWN_PRODUCT', productId: item.productId } };

    const quantity = new Decimal(item.quantity);
    if (!quantity.isFinite() || quantity.lte(0)) {
      return { ok: false, error: { code: 'NOT_POSITIVE', productId: item.productId } };
    }
    const stock = new Decimal(product.stock as never);
    if (quantity.gt(stock)) {
      return {
        ok: false,
        error: {
          code: 'EXCEEDS_STOCK',
          productId: product.id,
          product: product.nameRu,
          stock: stock.toString(),
          quantity: quantity.toString(),
        },
      };
    }

    const cost =
      product.cost === null || product.cost === undefined
        ? null
        : new Decimal(product.cost as never);
    if (cost) totalValue = totalValue.plus(cost.times(quantity));
    lines.push({
      productId: product.id,
      productName: product.nameRu,
      productNameUz: product.nameUz,
      barcode: product.barcode,
      unit: product.unit,
      quantity,
      cost,
    });
  }

  return { ok: true, lines, totalValue: totalValue.toDecimalPlaces(2), note };
}

/** English message, the same text the server sends for the same refusal. */
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
