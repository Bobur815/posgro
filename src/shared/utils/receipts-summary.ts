// The money cards above the receipts list (POS Reports → Receipts, web dashboard → Receipts).
//
// One function for both screens so the till and the dashboard can never disagree about a day.
// Every card is a sum of money, never a count of receipts:
//   - total:   full receipt value (finalAmount), nasiya included
//   - debt:    what went on customers' tabs in the period (debtAmount)
//   - tenders: money that actually arrived in each tender — the paid part of the receipts
//              (mixed receipts split by their sale_payments lines, via tenderAmounts) PLUS
//              nasiya paid back in that tender during the period
//
// Money is added in tiyin (integers), like split-payment.ts.

import { tenderAmounts, type TenderLine } from './split-payment';

type Money = number | string | null | undefined;

export interface SummarySale {
  finalAmount: Money;
  /** What changed hands at the counter. Missing (older API) = the whole receipt minus debt. */
  paidAmount?: Money;
  debtAmount?: Money;
  paymentMethod: string | null | undefined;
  totalCost?: Money;
  /** sale_payments lines; present only on split-payment receipts. */
  payments?: TenderLine[] | null;
}

/** A nasiya PAYMENT ledger row. `amount` is stored negative (it reduces a debt). */
export interface SummaryDebtPayment {
  amount: Money;
  paymentMethod: string | null | undefined;
}

export interface ReceiptsSummaryTotals {
  total: number;
  cost: number;
  /** (total − cost) / total × 100; 0 when there is no revenue. */
  margin: number;
  debt: number;
  /** Nasiya paid back in the period, all tenders together. Already inside `tenders`. */
  debtPaidBack: number;
  tenders: { cash: number; card: number; uzqr: number; click: number };
}

const toTiyin = (n: Money) => Math.round((Number(n) || 0) * 100);
const fromTiyin = (t: number) => t / 100;

export function summarizeReceipts(
  sales: readonly SummarySale[],
  debtPayments: readonly SummaryDebtPayment[] = [],
): ReceiptsSummaryTotals {
  let total = 0;
  let cost = 0;
  let debt = 0;
  let paidBack = 0;
  const t = { cash: 0, card: 0, uzqr: 0, click: 0 };

  for (const s of sales) {
    const finalT = toTiyin(s.finalAmount);
    const debtT = toTiyin(s.debtAmount);
    total += finalT;
    cost += toTiyin(s.totalCost);
    debt += debtT;

    const paidAmount = s.paidAmount == null ? fromTiyin(finalT - debtT) : Number(s.paidAmount) || 0;
    const lines = (s.payments ?? []).map((l) => ({
      method: l.method,
      amount: Number(l.amount) || 0,
    }));
    const a = tenderAmounts({ paymentMethod: s.paymentMethod, paidAmount }, lines);
    t.cash += toTiyin(a.cash);
    t.card += toTiyin(a.card);
    t.uzqr += toTiyin(a.uzqr);
    t.click += toTiyin(a.click);
  }

  for (const p of debtPayments) {
    const amountT = Math.abs(toTiyin(p.amount));
    const a = tenderAmounts({ paymentMethod: p.paymentMethod, paidAmount: fromTiyin(amountT) });
    const counted = toTiyin(a.cash) + toTiyin(a.card) + toTiyin(a.uzqr) + toTiyin(a.click);
    t.cash += toTiyin(a.cash);
    t.card += toTiyin(a.card);
    t.uzqr += toTiyin(a.uzqr);
    t.click += toTiyin(a.click);
    paidBack += counted;
  }

  return {
    total: fromTiyin(total),
    cost: fromTiyin(cost),
    margin: total > 0 ? ((total - cost) / total) * 100 : 0,
    debt: fromTiyin(debt),
    debtPaidBack: fromTiyin(paidBack),
    tenders: {
      cash: fromTiyin(t.cash),
      card: fromTiyin(t.card),
      uzqr: fromTiyin(t.uzqr),
      click: fromTiyin(t.click),
    },
  };
}
