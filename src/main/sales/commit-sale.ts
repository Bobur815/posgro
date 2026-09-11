import { format } from 'date-fns';
import { randomUUID } from 'node:crypto';
import { getPrismaClient } from '../database/sqlite-client';
import { toPieces } from '../../shared/utils/pack';
import type { Prisma, PrismaClient, Sale, SaleItem } from '../../generated/prisma-sqlite';

/**
 * The one place a sale changes stock.
 *
 * Every write that moves stock through a sale — ringing one up, editing it, deleting it — runs
 * here, one at a time, inside a transaction. That is what makes the main terminal the source of
 * truth for a shop with several tills (tasks/LAN_MAIN_TERMINAL_PLAN.md §3, §5.5): the IPC handler
 * for this till and the LAN route for each satellite both call in, and the queue below is where
 * their requests take turns.
 *
 * Why both a queue and a transaction:
 *
 *  - **The queue** closes the check-then-decrement race. The availability check and the decrement
 *    used to be separate awaits, so two requests for the last unit could both pass the check and
 *    both decrement — the double-sell §3 exists to prevent, just inside one process. SQLite's
 *    deferred transactions do not stop two readers seeing the same stock, so the serialisation has
 *    to happen here.
 *  - **The transaction** makes each commit all-or-nothing. A crash between inserting a sale and
 *    decrementing its stock would otherwise leave a receipt whose goods never left the shelf; and
 *    an edit that failed its stock check used to leave the old lines' stock restored for good.
 *
 * Structured refusals are thrown as `Error(JSON.stringify({code, …}))`, the format
 * `renderer/pages/POS/saleErrors.ts` already parses, and carry the payload as `refusal` so the LAN
 * route can answer with it directly.
 */

export interface SaleLineInput {
  productId: number | string;
  productName: string;
  barcode: string;
  quantity: number;
  unitPrice: number;
  piecesPerUnit?: number;
  preWeighedItemId?: string;
}

export interface SaleInput {
  /**
   * Optional, supplied by a satellite: the idempotency key for a commit made over the network. A
   * response lost after the main committed must not turn a retry into a second sale — see
   * `commitSale`. A till committing to its own database never needs one.
   */
  id?: string;
  items: SaleLineInput[];
  discountAmount?: number;
  paymentMethod: string;
  regosPaymentId?: string | null;
  regosPaymentRrn?: string | null;
}

/** Who is ringing the sale up, and on which till. */
export interface SaleActor {
  terminalId: string;
  cashierId: string;
  cashierName: string;
}

/** Who is asking to change or remove an existing sale. */
export interface SaleRequester {
  userId: string;
  phone: string;
  role: string;
  /** Set for a satellite: it may only touch the sales it rang up itself. */
  terminalId?: string;
}

export type SaleWithItems = Sale & { items: SaleItem[] };

/** Stock and price after the commit, for every product it touched — a satellite's cache refresh. */
export interface StockAfter {
  productId: number;
  barcode: string;
  stock: number;
  price: number;
}

export interface CommitResult {
  sale: SaleWithItems;
  stock: StockAfter[];
  /** True when this was a retry of a sale that had already been committed. Nothing was written. */
  replayed: boolean;
}

export type SaleRefusal = { code: string } & Record<string, unknown>;

export class SaleRefusedError extends Error {
  constructor(readonly refusal: SaleRefusal) {
    super(JSON.stringify(refusal));
  }
}

type Tx = Prisma.TransactionClient;

/** `getPrismaClient()` is `any` (a runtime require); a type-only import restores field checking. */
const db = (): PrismaClient => getPrismaClient() as PrismaClient;

/** Generous: a long receipt is several queries a line, on a till that may also be serving others. */
const TX_OPTIONS = { maxWait: 10_000, timeout: 20_000 };

let tail: Promise<unknown> = Promise.resolve();

/**
 * Run `fn` after everything queued before it, whether that succeeded or not.
 *
 * Exported for the shift writes in `shifts.ts`: opening or closing a shift in the middle of a
 * commit could otherwise file a sale under a shift that closed a moment earlier.
 */
export function serially<T>(fn: () => Promise<T>): Promise<T> {
  const run = tail.then(fn, fn);
  tail = run.catch(() => undefined);
  return run;
}

export function commitSale(input: SaleInput, actor: SaleActor): Promise<CommitResult> {
  return serially(() =>
    db().$transaction((tx) => commitInTx(tx, input, actor), TX_OPTIONS),
  );
}

export function updateSale(
  saleId: string,
  input: SaleInput,
  requester: SaleRequester,
): Promise<{ sale: SaleWithItems; stock: StockAfter[] }> {
  return serially(() =>
    db().$transaction((tx) => updateInTx(tx, saleId, input, requester), TX_OPTIONS),
  );
}

export function deleteSale(saleId: string, requester: SaleRequester): Promise<SaleWithItems> {
  return serially(() =>
    db().$transaction((tx) => deleteInTx(tx, saleId, requester), TX_OPTIONS),
  );
}

// ── inside the transaction ──────────────────────────────────────────────────────────────────────

async function commitInTx(tx: Tx, input: SaleInput, actor: SaleActor): Promise<CommitResult> {
  // A retry of a commit whose response never arrived. Returned untouched — no second decrement,
  // no second receipt number — so a satellite can safely try again after a timeout.
  if (input.id) {
    const existing = await tx.sale.findUnique({ where: { id: input.id }, include: { items: true } });
    if (existing) {
      // Someone else's id is not a retry, and answering with their receipt would be a leak.
      if (existing.terminalId !== actor.terminalId) {
        throw new SaleRefusedError({ code: 'SALE_ID_CONFLICT' });
      }
      return { sale: existing, stock: await stockAfter(tx, existing.items), replayed: true };
    }
  }

  await assertAvailable(tx, input.items);

  const smena = await tx.smena.findFirst({
    where: { terminalId: actor.terminalId, status: 'OPEN' },
    select: { id: true },
  });
  if (!smena) throw new SaleRefusedError({ code: 'NO_SMENA_OPEN' });

  const { lines, totalAmount } = priceLines(input.items);
  const discountAmount = input.discountAmount || 0;

  const sale = await tx.sale.create({
    data: {
      ...(input.id ? { id: input.id } : {}),
      receiptNumber: await nextReceiptNumber(tx, actor.terminalId),
      totalAmount,
      discountAmount,
      finalAmount: totalAmount - discountAmount,
      paymentMethod: input.paymentMethod,
      cashierId: actor.cashierId,
      cashierName: actor.cashierName,
      terminalId: actor.terminalId,
      smenaId: smena.id,
      // Present only when the optional UzQR integration confirmed a payment BEFORE this sale was
      // created. Its presence switches buildPayments() to the by-reference payment shape.
      regosPaymentId: input.regosPaymentId ?? null,
      regosPaymentRrn: input.regosPaymentRrn ?? null,
      synced: false,
      items: { create: lines },
    },
    include: { items: true },
  });

  await takeFromStock(tx, lines);

  for (const item of input.items) {
    if (!item.preWeighedItemId) continue;
    // updateMany, not update: a label already sold or never recorded is not fatal, and a throwing
    // statement is the wrong way to say so inside a transaction.
    await tx.preWeighedItem.updateMany({
      where: { id: item.preWeighedItemId },
      data: { status: 'SOLD', soldAt: new Date(), saleId: sale.id },
    });
  }

  return { sale, stock: await stockAfter(tx, sale.items), replayed: false };
}

async function updateInTx(
  tx: Tx,
  saleId: string,
  input: SaleInput,
  requester: SaleRequester,
): Promise<{ sale: SaleWithItems; stock: StockAfter[] }> {
  const existing = await tx.sale.findUnique({ where: { id: saleId }, include: { items: true } });
  if (!existing) throw new Error('Sale not found');
  assertMayTouch(existing, requester);

  // A fiscalized receipt is not ours to rewrite. The OFD holds the authoritative copy under this
  // sale's id, and REGOS uses that id as the idempotency `code` — re-sending edited contents is
  // rejected as a duplicate and tryRecoverByCode would then adopt the OLD receipt, leaving the
  // local row silently disagreeing with the fiscal one. The lawful correction is Возврат (full
  // refund) followed by a fresh sale, which the Sales History screen already offers.
  if (existing.fiscalStatus === 'FISCALIZED') {
    throw new SaleRefusedError({ code: 'SALE_ALREADY_FISCALIZED' });
  }
  // Likewise a receipt with money already taken against a REGOS payment id: editing it would move
  // the total away from the amount the buyer actually paid, and that payment cannot be re-booked
  // onto a different receipt.
  if (existing.regosPaymentId) {
    throw new SaleRefusedError({ code: 'SALE_HAS_PAYMENT' });
  }

  // The old lines go back on the shelf first, so the new ones are checked against the stock that
  // would exist without this sale. Inside the transaction, a failed check undoes the restore too.
  await returnToStock(tx, existing.items);
  await assertAvailable(tx, input.items);

  const { lines, totalAmount } = priceLines(input.items);
  const discountAmount = input.discountAmount || 0;

  await tx.saleItem.deleteMany({ where: { saleId } });
  const sale = await tx.sale.update({
    where: { id: saleId },
    data: {
      totalAmount,
      discountAmount,
      finalAmount: totalAmount - discountAmount,
      paymentMethod: input.paymentMethod,
      synced: false,
      items: { create: lines },
    },
    include: { items: true },
  });

  await takeFromStock(tx, lines);
  return { sale, stock: await stockAfter(tx, [...existing.items, ...sale.items]) };
}

async function deleteInTx(tx: Tx, saleId: string, requester: SaleRequester): Promise<SaleWithItems> {
  const sale = await tx.sale.findUnique({ where: { id: saleId }, include: { items: true } });
  if (!sale) throw new Error('Sale not found');
  assertMayTouch(sale, requester);

  await returnToStock(tx, sale.items);
  await tx.saleItem.deleteMany({ where: { saleId } });
  await tx.sale.delete({ where: { id: saleId } });

  // Kept solely so the shift Z/X-report can count returns (deleted sales). The details JSON keys
  // (finalAmount, smenaId) are read back by computeSmenaStats() in smena-handlers.ts; do not rename
  // them. Raw SQL because the Prisma AuditLog model was removed.
  await tx.$executeRawUnsafe(
    `INSERT INTO audit_logs (id, user_id, phone, action, entity, entity_id, details)
     VALUES (?, ?, ?, 'delete_sale', 'sale', ?, ?)`,
    randomUUID(),
    requester.userId,
    requester.phone,
    saleId,
    JSON.stringify({
      receiptNumber: sale.receiptNumber,
      totalAmount: Number(sale.finalAmount),
      finalAmount: Number(sale.finalAmount),
      smenaId: sale.smenaId ?? null,
      itemCount: sale.items.length,
    }),
  );

  return sale;
}

// ── pieces ──────────────────────────────────────────────────────────────────────────────────────

function assertMayTouch(sale: Sale, requester: SaleRequester): void {
  if (requester.role !== 'ADMIN' && sale.cashierId !== requester.userId) {
    throw new Error('Unauthorized');
  }
  if (requester.terminalId && sale.terminalId !== requester.terminalId) {
    throw new Error('Unauthorized');
  }
}

/**
 * Every product on the receipt has the pieces it needs.
 *
 * Summed per product before comparing: a cart can hold the same product twice — a piece line and
 * a box line — and checking each line alone let both pass while their total overdrew the shelf.
 * Stock is counted in pieces while a line's quantity is in sale units, hence toPieces().
 */
async function assertAvailable(tx: Tx, items: SaleLineInput[]): Promise<void> {
  const needed = new Map<number, number>();
  for (const item of items) {
    const id = Number(item.productId);
    needed.set(id, (needed.get(id) ?? 0) + toPieces(item.quantity, item.piecesPerUnit));
  }

  for (const [productId, pieces] of needed) {
    const product = await tx.product.findUnique({
      where: { id: productId },
      select: { id: true, nameRu: true, stock: true, active: true },
    });
    if (!product) throw new SaleRefusedError({ code: 'PRODUCT_NOT_FOUND', productId });
    if (!product.active) throw new SaleRefusedError({ code: 'PRODUCT_INACTIVE', name: product.nameRu });
    if (Number(product.stock) < pieces) {
      throw new SaleRefusedError({
        code: 'INSUFFICIENT_STOCK',
        name: product.nameRu,
        available: Number(product.stock),
        requested: pieces,
      });
    }
  }
}

function priceLines(items: SaleLineInput[]) {
  let totalAmount = 0;
  const lines = items.map((item) => {
    const subtotal = item.quantity * item.unitPrice;
    totalAmount += subtotal;
    return {
      productId: Number(item.productId),
      productName: item.productName,
      barcode: item.barcode,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      subtotal,
      piecesPerUnit: item.piecesPerUnit ?? 1,
    };
  });
  return { lines, totalAmount };
}

/** Decrement, then apply a pending price whose stock threshold has now been reached. */
async function takeFromStock(
  tx: Tx,
  lines: Array<{ productId: number; quantity: number; piecesPerUnit: number }>,
): Promise<void> {
  for (const line of lines) {
    const product = await tx.product.update({
      where: { id: line.productId },
      data: { stock: { decrement: toPieces(line.quantity, line.piecesPerUnit) } },
      select: { stock: true, pendingPrice: true, pendingPriceThreshold: true },
    });

    if (
      product.pendingPrice != null &&
      product.pendingPriceThreshold != null &&
      Number(product.stock) <= Number(product.pendingPriceThreshold)
    ) {
      await tx.product.update({
        where: { id: line.productId },
        data: { price: product.pendingPrice, pendingPrice: null, pendingPriceThreshold: null },
      });
    }
  }
}

async function returnToStock(
  tx: Tx,
  items: Array<{ productId: number; quantity: unknown; piecesPerUnit: number }>,
): Promise<void> {
  for (const item of items) {
    await tx.product.update({
      where: { id: item.productId },
      data: { stock: { increment: toPieces(Number(item.quantity), item.piecesPerUnit) } },
    });
  }
}

async function stockAfter(tx: Tx, items: Array<{ productId: number }>): Promise<StockAfter[]> {
  const ids = [...new Set(items.map((i) => i.productId))];
  const products = await tx.product.findMany({
    where: { id: { in: ids } },
    select: { id: true, barcode: true, stock: true, price: true },
  });
  return products.map((p: { id: number; barcode: string; stock: unknown; price: unknown }) => ({
    productId: p.id,
    barcode: p.barcode,
    stock: Number(p.stock),
    price: Number(p.price),
  }));
}

/**
 * `{terminalId}{yyMMdd}{seq}`, counted per terminal — so a satellite's sales, committed here, keep
 * the satellite's own prefix and sequence (§5.6), and the counter has exactly one home.
 *
 * Only ever called inside the queue above, which is what stops two receipts drawing the same
 * number; the old per-function mutex it replaces did the same job for this step alone.
 */
async function nextReceiptNumber(tx: Tx, terminalId: string): Promise<string> {
  const dateStr = format(new Date(), 'yyMMdd');
  const prefix = `${terminalId}${dateStr}`;
  const counterKey = `receipt_seq_${terminalId}_${dateStr}`;

  const stored = await tx.systemSetting.findUnique({ where: { key: counterKey } });
  let seq = stored ? parseInt(stored.value, 10) || 0 : 0;

  // Always verify the counter against the actual maximum — self-heals a counter that went stale
  // (a sync overwrote it, or an old race left it pointing at a receipt that already exists).
  const existing = await tx.sale.findMany({
    where: { receiptNumber: { startsWith: prefix } },
    select: { receiptNumber: true },
  });
  for (const row of existing) {
    const n = parseInt(row.receiptNumber.slice(prefix.length), 10);
    if (!isNaN(n) && n > seq) seq = n;
  }

  const next = seq + 1;
  await tx.systemSetting.upsert({
    where: { key: counterKey },
    update: { value: String(next) },
    create: { key: counterKey, value: String(next) },
  });

  return `${prefix}${String(next).padStart(3, '0')}`;
}
