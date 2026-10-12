// Fiscal backlog: which unfiscalised receipts may skip fiscalisation, and which must go to REGOS.
//
// Rule #1 (owner, 2026-10-04, extended 2026-10-05):
//  - paid by cash and/or Click alone, no marked product        → DISABLED (SKIP_TAG)
//  - paid by cash and/or Click alone, with marked products     → only the marked lines whose code is
//    valid in asl-belgisi are sent; if none is                 → DISABLED (SKIP_TAG_MARKING)
//  - anything with a card, UzQR or an open debt part           → sent in full (dead codes substituted)
// Tagged receipts are never picked up again; untagged DISABLED rows (fiscalisation off at sale
// time, or an earlier bulk run) are re-examined.
import { isFiscalCashTender } from '../constants/payment-methods';
import { MIXED_TENDER } from './split-payment';
import type { FiscalLinePlan } from '../types/fiscal.types';

/** fiscal_error marker of a cash/Click receipt without marked goods, DISABLED under rule #1. */
export const SKIP_TAG = 'skip:cash_unmarked';
/** fiscal_error marker of a cash/Click receipt none of whose marking codes is valid. */
export const SKIP_TAG_MARKING = 'skip:cash_marking_invalid';

export interface BacklogSaleShape {
  paymentMethod: string;
  /** Unpaid part of a nasiya sale. Not cash, so a receipt with one cannot skip. */
  debtAmount?: number | string | null;
  /** sale_payments rows; only a 'mixed' sale has them. */
  payments?: Array<{ method: string }>;
}

/** True if every tender of the receipt is fiscal cash (cash or Click). */
export function isCashOrClickOnly(sale: BacklogSaleShape): boolean {
  if (Number(sale.debtAmount ?? 0) > 0) return false;
  if (sale.paymentMethod === MIXED_TENDER) {
    const lines = sale.payments ?? [];
    // A mixed sale without its lines is unknowable — fiscalise rather than guess.
    return lines.length > 0 && lines.every((l) => isFiscalCashTender(l.method));
  }
  return isFiscalCashTender(sale.paymentMethod);
}

/** Rule #1: may this receipt be DISABLED outright, before any marking check? */
export function maySkipFiscalisation(sale: BacklogSaleShape, hasMarkedProduct: boolean): boolean {
  return !hasMarkedProduct && isCashOrClickOnly(sale);
}

/**
 * Whether a receipt belongs to the backlog at all: not yet fiscalised, not an unpaid credit sale
 * (DEFERRED_DEBT waits for its payment), and not already skipped under rule #1.
 */
export function isBacklogCandidate(
  fiscalStatus: string | null,
  fiscalError: string | null,
): boolean {
  if (fiscalStatus === 'FISCALIZED' || fiscalStatus === 'DEFERRED_DEBT') return false;
  return !(
    fiscalStatus === 'DISABLED' &&
    (fiscalError === SKIP_TAG || fiscalError === SKIP_TAG_MARKING)
  );
}

/** Parse sales.fiscal_substitutions; anything malformed reads as "no changes". */
export function parseLinePlan(raw: string | null | undefined): FiscalLinePlan[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (s): s is FiscalLinePlan =>
        typeof s === 'object' &&
        s !== null &&
        typeof (s as FiscalLinePlan).itemId === 'string' &&
        ((s as FiscalLinePlan).action === 'substitute' || (s as FiscalLinePlan).action === 'omit'),
    );
  } catch {
    return [];
  }
}

/** A substituted line goes out as 1 kg of the substitute at the line's own amount. */
export const SUBSTITUTE_QUANTITY = 1000;

// ── Merging old cash receipts (backlog step "group", flag regos_vcr_backlog_merge) ─────────────
// Only cash/Click-only receipts are merged: up to `size` of one calendar day into one REGOS receipt.
// Card, UzQR and split receipts are only sorted and still go out one by one. A merged sale is never
// refunded (owner, 2026-10-12): the backlog is old receipts an admin sends long after the sale.

/** sales.fiscal_batch_id of a merged sale: this prefix + an id, sent as the Receipt.Sale code. */
export const BATCH_PREFIX = 'batch:';
/** sales.fiscal_batch_id of a sale a rejected batch fell back from: never merged again. */
export const NO_BATCH = 'single';
export const DEFAULT_MERGE_SIZE = 100;
/** Lines per merged receipt. REGOS's own limit is undocumented; a batch is cut here first. */
export const MERGE_MAX_POSITIONS = 500;

export function isMergedBatchId(batchId: string | null | undefined): batchId is string {
  return typeof batchId === 'string' && batchId.startsWith(BATCH_PREFIX);
}

export type BacklogTender = 'CASH' | 'CARD' | 'UZQR';

/** Which group of the step a receipt sorts into. Everything not cash/Click and not UzQR is CARD. */
export function backlogTender(sale: BacklogSaleShape): BacklogTender {
  if (isCashOrClickOnly(sale)) return 'CASH';
  return sale.paymentMethod.toLowerCase() === 'uzqr' ? 'UZQR' : 'CARD';
}

/** A merge size from the setting: a whole number from 2 to 1000, else the default. */
export function parseMergeSize(raw: string | null | undefined): number {
  const n = Number(raw);
  return Number.isInteger(n) && n >= 2 && n <= 1000 ? n : DEFAULT_MERGE_SIZE;
}

export interface MergeCandidate {
  id: string;
  createdAt: Date;
  /** Lines that will actually be sent (omitted ones left out). */
  lines: number;
  /** Already assigned (a batch, or NO_BATCH): left exactly as it is. */
  batchId: string | null;
}

function localDay(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

/**
 * Batches for the cash receipts that have none yet: oldest first, never across a calendar day,
 * at most `size` receipts and MERGE_MAX_POSITIONS lines each. A chunk of one stays unbatched —
 * nothing to merge it with — and is sent on its own. Returns saleId → new batch id.
 */
export function planCashBatches(
  candidates: MergeCandidate[],
  size: number,
  newId: () => string,
  maxLines = MERGE_MAX_POSITIONS,
): Map<string, string> {
  const free = candidates
    .filter((c) => !c.batchId)
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  const out = new Map<string, string>();
  let chunk: MergeCandidate[] = [];
  let lines = 0;
  const flush = () => {
    if (chunk.length > 1) {
      const id = BATCH_PREFIX + newId();
      for (const c of chunk) out.set(c.id, id);
    }
    chunk = [];
    lines = 0;
  };
  for (const c of free) {
    const full =
      chunk.length > 0 &&
      (chunk.length >= size ||
        lines + c.lines > maxLines ||
        localDay(chunk[0].createdAt) !== localDay(c.createdAt));
    if (full) flush();
    chunk.push(c);
    lines += c.lines;
  }
  flush();
  return out;
}

export interface BacklogSumRow {
  finalAmount: number | string;
  fiscalStatus: string | null;
  fiscalError: string | null;
  /** What REGOS received for the sale, in tiyin; null on sales fiscalised before 1.38. */
  fiscalSentTiyin?: number | null;
}

/**
 * "Fiscalised / total" from a date, in tiyin. Total: every receipt that had to be fiscalised —
 * still in the backlog, or FISCALIZED (rule #1 skips and unpaid credit sales are out). Fiscalised:
 * what REGOS actually received, so a cash receipt sent with only its marked lines counts for less.
 */
export function backlogSums(rows: BacklogSumRow[]): {
  totalTiyin: number;
  fiscalizedTiyin: number;
} {
  let totalTiyin = 0;
  let fiscalizedTiyin = 0;
  for (const r of rows) {
    const full = Math.round(Number(r.finalAmount) * 100);
    if (r.fiscalStatus === 'FISCALIZED') {
      totalTiyin += full;
      fiscalizedTiyin += r.fiscalSentTiyin ?? full;
    } else if (isBacklogCandidate(r.fiscalStatus, r.fiscalError)) {
      totalTiyin += full;
    }
  }
  return { totalTiyin, fiscalizedTiyin };
}
