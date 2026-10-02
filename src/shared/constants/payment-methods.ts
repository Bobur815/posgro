// ==================== SALE TENDERS (what the POS actually stores) ====================
// `sales.payment_method` is a free-form String in both schemas and the POS writes these
// LOWER-CASE values. The upper-case PAYMENT_METHODS block below is a separate, older
// vocabulary used elsewhere — the two have always been distinct, so don't merge them.

/**
 * `click` (Click app payment) is the odd one: the money goes to the shop's Click account, never the
 * drawer — but it is fiscalised as CASH (see isFiscalCashTender) and kept as its own tender for
 * analytics. The Checkout tile shows only on tills with the `click_enabled` setting on.
 */
export const SALE_TENDERS = ["cash", "card", "uzqr", "click"] as const;

export type SaleTender = (typeof SALE_TENDERS)[number];

/**
 * What `payment_method` says when nothing was paid at the counter — the whole receipt went on a
 * customer's tab (nasiya).
 *
 * Deliberately NOT in SALE_TENDERS: those are the three ways money arrives now, and the Checkout
 * screen renders one tile per entry. A part-paid credit sale keeps the tender that took the
 * money (`cash`/`card`/`uzqr`) and records the rest in `sales.debt_amount`, so only a receipt
 * where nothing at all was paid is stored as "debt".
 *
 * `isCashTender` already answers false for it, which is the property that matters: debt is never
 * money in the till.
 */
export const DEBT_TENDER = "debt" as const;

/**
 * Only cash lands in the drawer. UzQR settles to the merchant's bank account exactly like
 * a card, so every drawer/X-Z/cashless split must treat it as card-side.
 *
 * Written as "is it cash" rather than "is it card" on purpose: legacy rows hold values
 * like `mixed`, and an unknown tender must never be counted as money in the till.
 */
export function isCashTender(method: string | null | undefined): boolean {
  return (method ?? "").toLowerCase() === "cash";
}

export function isClickTender(method: string | null | undefined): boolean {
  return (method ?? "").toLowerCase() === "click";
}

/**
 * What the fiscal receipt (REGOS) and the bank-turnover "fiscalised cash" side count as cash:
 * cash and Click. Never use this for the drawer — Click money is not in the till; that is
 * isCashTender.
 */
export function isFiscalCashTender(method: string | null | undefined): boolean {
  return isCashTender(method) || isClickTender(method);
}

/** i18n keys for the POS tender labels, so no screen hardcodes "Карта" / "UzQR". */
export const SALE_TENDER_I18N_KEYS: Record<SaleTender, string> = {
  cash: "pos.cash",
  card: "pos.card",
  uzqr: "pos.uzqr",
  click: "pos.click",
};

/** Brand navy sampled from the UzQR logo — the button field must match the artwork. */
export const UZQR_BRAND_COLOR = "#0d2a73";

/** Brand blue sampled from the Click logo (src/renderer/assets/Click-light_no_background.png). */
export const CLICK_BRAND_COLOR = "#0065ff";

// ==================== SALE PAYMENT METHODS ====================
// Used for POS checkout (CASH, CARD, MIXED)

export const PAYMENT_METHODS = {
  CASH: "CASH",
  CARD: "CARD",
  MIXED: "MIXED",
} as const;

export type PaymentMethod =
  (typeof PAYMENT_METHODS)[keyof typeof PAYMENT_METHODS];

export const PAYMENT_METHOD_LABELS = {
  ru: {
    CASH: "Наличные",
    CARD: "Карта",
    MIXED: "Смешанная оплата",
  },
  uz: {
    CASH: "Naqd pul",
    CARD: "Karta",
    MIXED: "Aralash to'lov",
  },
} as const;

export const getPaymentMethodLabel = (
  method: PaymentMethod,
  locale: "ru" | "uz" = "ru",
): string => {
  return PAYMENT_METHOD_LABELS[locale][method] || method;
};

// ==================== SUPPLIER PAYMENT METHODS ====================
// Used for supplier transactions (arrivals, payments, etc.)

export const SUPPLIER_PAYMENT_METHODS = [
  "CASH",
  "CARD",
  "BANK_TRANSFER",
  "INSTALLMENT",
] as const;

export type SupplierPaymentMethod = (typeof SUPPLIER_PAYMENT_METHODS)[number];

/** Maps each SupplierPaymentMethod value to its i18n translation key */
export const SUPPLIER_PAYMENT_METHOD_I18N_KEYS: Record<
  SupplierPaymentMethod,
  string
> = {
  CASH: "suppliers.cash",
  CARD: "suppliers.card",
  BANK_TRANSFER: "suppliers.bankTransfer",
  INSTALLMENT: "suppliers.installment",
} as const;
