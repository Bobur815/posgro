// Split payment: one receipt paid by several tenders (cash + card + Click + UzQR).
//
// Storage: a split sale has payment_method = MIXED_TENDER and one sale_payments row per tender;
// a single-tender sale has NO rows and its whole paid amount is on payment_method. Every figure
// that splits money by tender — drawer, shift, REGOS, bank turnover, reports — goes through
// tenderAmounts(), so the two shapes can never be read differently in two places.
//
// Money is added in tiyin (integers): so'm amounts with fractions would otherwise drift.

/** payment_method of a split-payment receipt. Already in the receipt vocabulary ("Смешанная"). */
export const MIXED_TENDER = 'mixed' as const;

/** The tenders a split line can have. Nasiya is not one of them (v1: no credit in a split). */
export const SPLIT_TENDERS = ['cash', 'card', 'uzqr', 'click'] as const;
export type SplitTender = (typeof SPLIT_TENDERS)[number];

export interface TenderLine {
  method: string;
  amount: number;
}

export interface TenderAmounts {
  cash: number;
  card: number;
  uzqr: number;
  click: number;
  /** Anything else ('debt', legacy values): never counted as money in the till or at the bank. */
  other: number;
}

const toTiyin = (n: number) => Math.round(n * 100);
const fromTiyin = (t: number) => t / 100;

/**
 * What a receipt's paid money was in each tender.
 *
 * `lines` are its sale_payments rows. With none, the whole `paidAmount` is on `paymentMethod` —
 * every sale before split payment, and every single-tender sale after it.
 */
export function tenderAmounts(
  sale: { paymentMethod: string | null | undefined; paidAmount: number },
  lines: TenderLine[] = [],
): TenderAmounts {
  const t = { cash: 0, card: 0, uzqr: 0, click: 0, other: 0 };
  const source: TenderLine[] =
    lines.length > 0 ? lines : [{ method: sale.paymentMethod ?? '', amount: sale.paidAmount }];
  for (const line of source) {
    const m = (line.method ?? '').toLowerCase();
    const key: keyof TenderAmounts = (SPLIT_TENDERS as readonly string[]).includes(m)
      ? (m as SplitTender)
      : 'other';
    t[key] += toTiyin(Number(line.amount) || 0);
  }
  return {
    cash: fromTiyin(t.cash),
    card: fromTiyin(t.card),
    uzqr: fromTiyin(t.uzqr),
    click: fromTiyin(t.click),
    other: fromTiyin(t.other),
  };
}

export interface SplitState {
  /** Σ of the lines as entered (cash may include change still to hand back). */
  entered: number;
  /** total − entered, never below 0: what the "remaining" button would put on a line. */
  remaining: number;
  /** Cash handed back: entered − total, only when the excess is on the cash line. */
  change: number;
  /** All lines together cover the total and only cash goes over it. */
  canPay: boolean;
  /** Why not, for the screen. */
  problem: 'none' | 'short' | 'nonCashOver' | 'empty';
}

/**
 * The checkout math of a split payment.
 *
 * The lines must cover the total; only the cash line may exceed it (the excess is change, as with
 * a single cash payment). Non-cash lines together may never exceed the total — a card terminal or
 * QR is charged an exact figure, and there is no change to give back from one.
 */
export function splitState(total: number, lines: TenderLine[]): SplitState {
  const totalT = toTiyin(total);
  const used = lines.filter((l) => toTiyin(l.amount) > 0);
  const enteredT = used.reduce((s, l) => s + toTiyin(l.amount), 0);
  const nonCashT = used
    .filter((l) => l.method !== 'cash')
    .reduce((s, l) => s + toTiyin(l.amount), 0);
  const remaining = fromTiyin(Math.max(0, totalT - enteredT));

  let problem: SplitState['problem'] = 'none';
  if (used.length === 0) problem = 'empty';
  else if (nonCashT > totalT) problem = 'nonCashOver';
  else if (enteredT < totalT) problem = 'short';

  return {
    entered: fromTiyin(enteredT),
    remaining,
    change: problem === 'none' ? fromTiyin(enteredT - totalT) : 0,
    canPay: problem === 'none',
    problem,
  };
}

/** The "remaining" button: what the active line should hold so the lines cover the total. */
export function remainingFor(total: number, lines: TenderLine[], activeMethod: string): number {
  const othersT = lines
    .filter((l) => l.method !== activeMethod)
    .reduce((s, l) => s + toTiyin(l.amount), 0);
  return fromTiyin(Math.max(0, toTiyin(total) - othersT));
}

/**
 * The rows to store for a split sale: zero lines dropped, and the change taken off the cash line
 * so the rows add up to the receipt total — cash net of change is what stayed in the drawer.
 */
export function linesToStore(total: number, lines: TenderLine[]): TenderLine[] {
  const state = splitState(total, lines);
  if (!state.canPay) throw new Error('split payment does not cover the total');
  const changeT = toTiyin(state.change);
  return lines
    .filter((l) => toTiyin(l.amount) > 0)
    .map((l) => ({
      method: l.method,
      amount: l.method === 'cash' ? fromTiyin(toTiyin(l.amount) - changeT) : l.amount,
    }))
    .filter((l) => toTiyin(l.amount) > 0);
}
