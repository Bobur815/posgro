import { getPrismaClient } from '../database/sqlite-client';
import type { PrismaClient } from '../../generated/prisma-sqlite';

/**
 * A satellite's read cache of what its main terminal holds (tasks/LAN_MAIN_TERMINAL_PLAN.md §5.9).
 *
 * The main owns the truth; a satellite keeps copies so it has something to read when the main is
 * away — price lookups, today's sales, the shift that is open — and something to print from, since
 * `printReceipt()` reads the sale off this machine's own database (§5.12).
 *
 * Only what this till originated is cached: its own sales and its own shift. Products are the
 * exception, refreshed by the catalog pull and by the stock figures every commit returns.
 */

const db = (): PrismaClient => getPrismaClient() as PrismaClient;

/** A sale as the main returns it — a raw row in JSON: Decimals as strings, dates as ISO. */
export interface RemoteSale {
  id: string;
  receiptNumber: string;
  totalAmount: string | number;
  discountAmount: string | number;
  finalAmount: string | number;
  paymentMethod: string;
  cashierId: string;
  cashierName: string;
  terminalId: string;
  smenaId: string | null;
  fiscalStatus?: string | null;
  fiscalAttempts?: number;
  fiscalError?: string | null;
  regosReceiptId?: string | null;
  regosFiscalSign?: string | null;
  regosQrCodeUrl?: string | null;
  regosTerminalId?: string | null;
  regosReceiptNo?: string | null;
  regosFiscalAt?: string | null;
  regosLabels?: string | null;
  regosPaymentId?: string | null;
  regosPaymentRrn?: string | null;
  refunded?: boolean;
  createdAt: string;
  items: Array<{
    id: string;
    productId: number;
    productName: string;
    barcode: string;
    quantity: string | number;
    unitPrice: string | number;
    subtotal: string | number;
    piecesPerUnit: number;
  }>;
}

export interface RemoteStock {
  productId: number;
  barcode: string;
  stock: number;
  price: number;
}

export interface RemoteShift {
  id: string;
  terminalId: string;
  cashierId: string;
  cashierName: string;
  status: string;
  initialCash: string | number;
  finalCash: string | number | null;
  zReportNumber: number;
  openedAt: string;
  closedAt: string | null;
  regosZReportId?: number | null;
  movements?: RemoteMovement[];
}

export interface RemoteMovement {
  id: string;
  smenaId: string;
  type: string;
  amount: string | number;
  note: string | null;
  createdAt: string;
}

/**
 * Take the stock and price the main reports after a commit. Matched by barcode: the ids in it are
 * the main's, and this till's ids for the same products may differ.
 */
export async function applyStock(stock: RemoteStock[]): Promise<void> {
  for (const s of stock) {
    await db().product.updateMany({
      where: { barcode: s.barcode },
      data: { stock: s.stock, price: s.price },
    });
  }
}

export async function cacheShift(shift: RemoteShift): Promise<void> {
  const data = {
    terminalId: shift.terminalId,
    cashierId: shift.cashierId,
    cashierName: shift.cashierName,
    status: shift.status,
    initialCash: shift.initialCash,
    finalCash: shift.finalCash,
    zReportNumber: shift.zReportNumber,
    openedAt: new Date(shift.openedAt),
    closedAt: shift.closedAt ? new Date(shift.closedAt) : null,
    // A copy: the main uploads the shift, this till never does.
    synced: true,
  };
  await db().smena.upsert({ where: { id: shift.id }, update: data, create: { id: shift.id, ...data } });
  for (const m of shift.movements ?? []) await cacheMovement(m);
}

export async function cacheMovement(m: RemoteMovement): Promise<void> {
  const data = {
    smenaId: m.smenaId,
    type: m.type,
    amount: m.amount,
    note: m.note,
    createdAt: new Date(m.createdAt),
  };
  await db().smenaMovement.upsert({ where: { id: m.id }, update: data, create: { id: m.id, ...data } });
}

/**
 * Store a sale the main committed for this till, so it can be printed and read here.
 *
 * Each line is re-pointed at this till's own product for the same barcode, using the barcodes the
 * main sent back with its stock figures. A line whose product this till does not have is a line it
 * could not have sold — the cart is built from this catalog — so it is reported rather than guessed.
 */
export async function cacheSale(sale: RemoteSale, stock: RemoteStock[]): Promise<void> {
  const barcodeByMainId = new Map(stock.map((s) => [s.productId, s.barcode]));
  const barcodes = sale.items.map((item) => barcodeByMainId.get(item.productId) ?? item.barcode);
  const local = await db().product.findMany({
    where: { barcode: { in: [...new Set(barcodes)] } },
    select: { id: true, barcode: true },
  });
  const localIdByBarcode = new Map(local.map((p) => [p.barcode, p.id]));

  const items = sale.items.map((item, i) => {
    const productId = localIdByBarcode.get(barcodes[i]);
    if (productId === undefined) {
      throw new Error(`[satellite] sale ${sale.receiptNumber}: no local product for ${barcodes[i]}`);
    }
    return {
      id: item.id,
      productId,
      productName: item.productName,
      barcode: item.barcode,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      subtotal: item.subtotal,
      piecesPerUnit: item.piecesPerUnit,
    };
  });

  const data = {
    receiptNumber: sale.receiptNumber,
    totalAmount: sale.totalAmount,
    discountAmount: sale.discountAmount,
    finalAmount: sale.finalAmount,
    paymentMethod: sale.paymentMethod,
    cashierId: sale.cashierId,
    cashierName: sale.cashierName,
    terminalId: sale.terminalId,
    smenaId: sale.smenaId,
    fiscalStatus: sale.fiscalStatus ?? null,
    fiscalAttempts: sale.fiscalAttempts ?? 0,
    fiscalError: sale.fiscalError ?? null,
    regosReceiptId: sale.regosReceiptId ?? null,
    regosFiscalSign: sale.regosFiscalSign ?? null,
    regosQrCodeUrl: sale.regosQrCodeUrl ?? null,
    regosTerminalId: sale.regosTerminalId ?? null,
    regosReceiptNo: sale.regosReceiptNo ?? null,
    regosFiscalAt: sale.regosFiscalAt ? new Date(sale.regosFiscalAt) : null,
    regosLabels: sale.regosLabels ?? null,
    regosPaymentId: sale.regosPaymentId ?? null,
    regosPaymentRrn: sale.regosPaymentRrn ?? null,
    refunded: sale.refunded ?? false,
    // Never uploaded from here: the main holds the sale and sends it to the VPS itself.
    synced: true,
    createdAt: new Date(sale.createdAt),
  };

  await db().$transaction(async (tx) => {
    await tx.saleItem.deleteMany({ where: { saleId: sale.id } });
    await tx.sale.upsert({
      where: { id: sale.id },
      update: { ...data, items: { create: items } },
      create: { id: sale.id, ...data, items: { create: items } },
    });
  });
}

export async function forgetSale(saleId: string): Promise<void> {
  await db().$transaction([
    db().saleItem.deleteMany({ where: { saleId } }),
    db().sale.deleteMany({ where: { id: saleId } }),
  ]);
}
