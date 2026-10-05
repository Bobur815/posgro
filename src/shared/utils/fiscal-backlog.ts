// Fiscal backlog: which unfiscalised receipts may skip fiscalisation, and which must go to REGOS.
//
// Rule #1 (owner, 2026-10-04): a receipt may skip fiscalisation only when it was paid by cash
// and/or Click alone AND has no marked product. Anything with a card, UzQR, an open debt part or a
// marked product must be fiscalised. Skipped receipts are DISABLED and tagged with SKIP_TAG so no
// later run picks them up again; untagged DISABLED rows (fiscalisation off at sale time, or an
// earlier bulk run) are re-examined.
import { isFiscalCashTender } from '../constants/payment-methods';
import { MIXED_TENDER } from './split-payment';
import type { FiscalSubstitution } from '../types/fiscal.types';

/** fiscal_error marker of a receipt DISABLED under rule #1. */
export const SKIP_TAG = 'skip:cash_unmarked';

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

/** Rule #1: may this receipt be DISABLED instead of fiscalised? */
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
  return !(fiscalStatus === 'DISABLED' && fiscalError === SKIP_TAG);
}

/** Parse sales.fiscal_substitutions; anything malformed reads as "no substitutions". */
export function parseSubstitutions(raw: string | null | undefined): FiscalSubstitution[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (s): s is FiscalSubstitution =>
        typeof s === 'object' &&
        s !== null &&
        typeof (s as FiscalSubstitution).barcode === 'string',
    );
  } catch {
    return [];
  }
}

/** A substituted line goes out as 1 kg of the substitute at the line's own amount. */
export const SUBSTITUTE_QUANTITY = 1000;
