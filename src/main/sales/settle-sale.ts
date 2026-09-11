import { getPrismaClient } from '../database/sqlite-client';
import { regosVcrService } from '../fiscal/regos-vcr-service';
import { savePendingMarkingCodes } from '../ipc/marking-codes-handlers';
import { markSettled } from './commit-sale';

/**
 * What happens to a sale once `commitSale` has written it: the marking-label snapshot, the fiscal
 * queue, and the OFD round-trip if this sale fiscalizes now.
 *
 * Shared by the till's own `sales:create`/`sales:update` and by a main answering a satellite, so a
 * satellite's receipt goes through exactly the fiscal pipeline a local one does (§5.11). Printing is
 * deliberately not here: the till that rang the sale up prints it, on its own printer (§5.12).
 */

export interface SettleOptions {
  fiscalize?: boolean;
  regosPaymentId?: string | null;
  markingCodes?: Array<{ barcode: string; label: string }>;
}

/**
 * The marking labels scanned for a sale, serialized for sale.regosLabels — the authoritative
 * sale→marking-code link that markingCodes:removeForSale reads to free the SoldMarkingCode rows
 * when the receipt is later deleted or refunded.
 */
export function serializeMarkingLabels(
  markingCodes: Array<{ barcode: string; label: string }> | undefined,
): { labels: Array<{ barcode: string; label: string }>; json: string | null } {
  const labels = markingCodes?.filter((l) => l?.barcode && l?.label) ?? [];
  return { labels, json: labels.length ? JSON.stringify(labels) : null };
}

/**
 * Queue the sale for fiscalization and start it now if asked.
 *
 * Returns the in-flight fiscalization, already `.catch()`-ed so awaiting it never throws, or null
 * when nothing was started. The caller decides what to wait for: the till's printer waits for it so
 * the QR lands on the paper; a satellite's request waits a bounded time for it so the QR can travel
 * back with the sale.
 *
 * Wrapped in an object on purpose. An async function cannot resolve *to* a promise — it would be
 * flattened, and `await settleSale()` would silently wait out the whole OFD round-trip.
 *
 * Never throws: a failure leaves the sale PENDING/FAILED for a later retry, which is the whole point
 * of the offline-first design.
 */
export async function settleSale(
  saleId: string,
  options: SettleOptions,
  /** The till the sale belongs to, for the pending marking-code rows. */
  terminalId: string,
): Promise<{ fiscalizing: Promise<void> | null }> {
  // Snapshot the scanned group-020/022 marking labels on the sale row, ALWAYS — not only when
  // fiscalization is enabled. Persisting it synchronously here, rather than relying on the
  // fire-and-forget savePendingMarkingCodes below, avoids a race where a quick delete runs before
  // that pending row is written.
  const { labels, json: regosLabels } = serializeMarkingLabels(options.markingCodes);

  const prisma = getPrismaClient();
  let fiscalizing: Promise<void> | null = null;
  try {
    if (await regosVcrService.isEnabled()) {
      await prisma.sale.update({
        where: { id: saleId },
        // fiscalAttempts/fiscalError are cleared, not just carried over. On create they are
        // already empty; on an edit the contents just changed, so failures recorded against the
        // previous version no longer apply — leaving the count would let an edited sale start
        // at or over MAX_ATTEMPTS and be skipped by processPending forever.
        data: { fiscalStatus: 'PENDING', regosLabels, fiscalAttempts: 0, fiscalError: null },
      });
      // A UzQR sale fiscalizes NOW regardless of the checkbox: REGOS forbids reusing a
      // Payment.Create payment across receipts, so deferring would strand the payment_id and
      // the buyer's money with it.
      if (options.fiscalize || options.regosPaymentId) {
        fiscalizing = regosVcrService.fiscalizeSale(saleId).catch((e) =>
          console.error('[fiscal] immediate fiscalize failed (will retry):', e instanceof Error ? e.message : e),
        );
      }
    } else {
      await prisma.sale.update({
        where: { id: saleId },
        data: { fiscalStatus: 'DISABLED', regosLabels },
      });
    }
  } catch (e) {
    console.error('[fiscal] enqueue failed:', e instanceof Error ? e.message : e);
  }

  // Capture the sale's group-022 marking codes for later REGOS:VCR out-of-circulation
  // fiscalization. No asl-belgisi lookup happens here — circulation is checked on the
  // /marking-check screen, not during a sale. Fire-and-forget: the local write is followed by a
  // best-effort VPS sync, and neither may delay the sale or its receipt.
  let markingSaved: Promise<unknown> = Promise.resolve();
  if (labels.length > 0) {
    markingSaved = savePendingMarkingCodes(
      labels.map((m) => ({ code: m.label, productBarcode: m.barcode, saleId })),
      terminalId,
    ).catch((e) =>
      console.error('[marking] savePending failed:', e instanceof Error ? e.message : e),
    );
  }

  // Settled once the local writes are down. The fiscal round-trip is not waited for here — a
  // handoff waits for that through the VCR's own queue.
  void markingSaved.finally(() => markSettled(saleId));

  return { fiscalizing };
}
