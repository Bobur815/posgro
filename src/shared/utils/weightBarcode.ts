/**
 * Weight Barcode Parser for Rongta RLS Label Scale
 *
 * Confirmed layout from real labels:
 *   "2500008903160" → product ID 89, weight 0.316 kg
 *   "2500008522583" → product ID 85, weight 2.258 kg
 *
 * EAN-13 format (13 digits):
 * Position:  0   1   2 3 4 5 6 7   8 9 10 11   12
 * Content:  [2] [S] [P P P P P P] [W W  W  W] [CHK]
 *
 * D0      = "2"   — weight-item flag (always 2)
 * D1      = "S"   — section digit set in RLS1000 (0–9, varies)
 * D2–D7   = "PPPPPP" — SQLite product ID, 6 digits zero-padded → "000089"
 * D8–D11  = "WWWW"   — weight, 4 digits, W.WWW kg             → "0316" = 0.316 kg
 * D12     = EAN-13 check digit
 *
 * In RLS1000: set Fresh Code = SQLite product ID (e.g. product 89 → Fresh Code 89).
 * Lookup: productIdNum → products.getById(productIdNum)
 *
 * Configure weightDecimalPlaces to match your scale setting (default: 3).
 */

export type WeightUnit = "kg" | "g";

export interface WeightBarcodeConfig {
  /**
   * How many decimal places the scale uses in the weight field.
   * - 3 = grams precision (01500 → 1.500 kg)   ← Rongta RLS default
   * - 2 = 10-gram precision (01500 → 15.00 kg)
   */
  weightDecimalPlaces: 2 | 3;

  /** Output unit for the parsed weight */
  outputUnit: WeightUnit;
}

// Confirmed byte layout from real Rongta RLS label (barcode "2500008522583")
const PLU_START = 2;   // inclusive — skip D0 (flag "2") and D1 (section digit)
const PLU_END = 8;     // exclusive → digits 2–7 = 6-char goods code ("000085")
const WEIGHT_START = 8;
const WEIGHT_END = 12; // exclusive → digits 8–11 = 4-char weight ("2258" = 2.258 kg)

export interface ParsedWeightBarcode {
  /** The raw 13-digit barcode string */
  raw: string;

  /** Product ID encoded in barcode (D2–D7), zero-padded, e.g. "000089" for product ID 89 */
  productId: string;

  /** Numeric product ID, e.g. 89 — use this to look up the product in the DB */
  productIdNum: number;

  /** Weight in the configured output unit */
  weight: number;

  /** Weight unit (kg or g) */
  unit: WeightUnit;

  /** Human-readable weight string e.g. "1.250 kg" */
  weightDisplay: string;
}

const DEFAULT_CONFIG: WeightBarcodeConfig = {
  weightDecimalPlaces: 3, // Rongta RLS default: grams with 3 decimal places in kg
  outputUnit: "kg",
};

/**
 * Returns true if the scanned barcode is a weight barcode from a label scale.
 * Weight barcodes always start with "2" and are exactly 13 digits long.
 */
export function isWeightBarcode(barcode: string): boolean {
  return (
    typeof barcode === "string" &&
    barcode.length === 13 &&
    barcode.startsWith("2") &&
    /^\d{13}$/.test(barcode)
  );
}

/**
 * Parses an EAN-13 weight barcode printed by a Rongta RLS (or compatible) scale.
 *
 * @param barcode - The 13-digit scanned barcode string
 * @param config  - Optional config (defaults match Rongta RLS factory settings)
 * @returns ParsedWeightBarcode or null if the barcode is not a valid weight barcode
 *
 * @example
 * // Real label: goods code 85, section 5, weight 2.258 kg
 * const result = parseWeightBarcode("2500008522583");
 * // D0='2' D1='5' D2–D7='000085' D8–D11='2258' D12='3'
 * // result.productId     → "000085"   (zero-padded product ID)
 * // result.productIdNum  → 85        (use for DB lookup: products.getById(85))
 * // result.weight        → 2.258
 * // result.unit          → "kg"
 * // result.weightDisplay → "2.258 kg"
 */
export function parseWeightBarcode(
  barcode: string,
  config: WeightBarcodeConfig = DEFAULT_CONFIG
): ParsedWeightBarcode | null {
  if (!isWeightBarcode(barcode)) return null;

  // D0="2"(flag), D1=section, D2–D7=goods code(6), D8–D11=weight(4), D12=check
  const productId = barcode.substring(PLU_START, PLU_END);         // e.g. "000089" (D2–D7)
  const weightRaw = barcode.substring(WEIGHT_START, WEIGHT_END);  // e.g. "0316" (D8–D11)

  const productIdNum = parseInt(productId, 10);
  const weightInt = parseInt(weightRaw, 10);

  if (isNaN(productIdNum) || isNaN(weightInt)) return null;

  // e.g. "1250" with 3 decimal places → 1250 / 1000 = 1.250 kg
  const divisor = Math.pow(10, config.weightDecimalPlaces);
  let weight = weightInt / divisor;

  if (config.outputUnit === "g") {
    weight = weight * 1000;
  }

  const weightDisplay =
    config.outputUnit === "kg"
      ? `${weight.toFixed(config.weightDecimalPlaces)} kg`
      : `${Math.round(weight)} g`;

  return {
    raw: barcode,
    productId,
    productIdNum,
    weight,
    unit: config.outputUnit,
    weightDisplay,
  };
}

/**
 * Calculates the price for a weight-based item.
 * @example
 * calculateWeightPrice(12500, 1.250) → 15625  (UZS)
 */
export function calculateWeightPrice(
  pricePerKg: number,
  weightKg: number
): number {
  return Math.round(pricePerKg * weightKg * 100) / 100;
}

/**
 * Validates the EAN-13 check digit of a barcode.
 */
export function validateEan13CheckDigit(barcode: string): boolean {
  if (barcode.length !== 13 || !/^\d{13}$/.test(barcode)) return false;

  const digits = barcode.split("").map(Number);
  const checkDigit = digits[12];

  const sum = digits.slice(0, 12).reduce((acc, digit, index) => {
    return acc + digit * (index % 2 === 0 ? 1 : 3);
  }, 0);

  const calculated = (10 - (sum % 10)) % 10;
  return calculated === checkDigit;
}

/**
 * Formats a goods code number into a 6-digit zero-padded string
 * matching the internalCode field in the products table.
 * @example
 * formatGoodsCode(85) → "000085"
 * formatGoodsCode(1)  → "000001"
 */
export function formatGoodsCode(code: number): string {
  return String(code).padStart(6, "0");
}

/** @deprecated use formatGoodsCode */
export const formatPlu = formatGoodsCode;
