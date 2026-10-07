/** How the cashier typed the discount: a sum in so'm, or a percent of the receipt. */
export type DiscountMode = "sum" | "percent";

/**
 * The discount in so'm for what the cashier typed, against the receipt before any discount
 * (`subtotal + tax`). Whole so'm — a percent of 12 345 is not worth tiyin on a receipt — and never
 * below zero or above the receipt, so the total can only reach 0, never go negative.
 */
export function resolveDiscount(value: number, mode: DiscountMode, gross: number): number {
  if (!Number.isFinite(value) || value <= 0 || gross <= 0) return 0;
  const amount = mode === "percent" ? (gross * Math.min(value, 100)) / 100 : value;
  return Math.min(Math.round(amount), Math.round(gross));
}

/** Parses the numpad / keyboard text: spaces dropped, a comma read as the decimal point. */
export function parseDiscountInput(text: string): number {
  const n = parseFloat(text.replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}
