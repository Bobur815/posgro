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
