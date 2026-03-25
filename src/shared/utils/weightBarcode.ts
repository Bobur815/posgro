/**
 * Weight Barcode Parser for Rongta RLS Label Scale
 *
 * Rongta RLS scales print EAN-13 barcodes starting with "2".
 * The barcode encodes both the product PLU and the weight.
 *
 * Standard Format (EAN-13, 13 digits):
 * Position:  0   1 2 3 4 5 6   7 8 9 10 11   12
 * Content:  [2] [P P P P P P] [W W W  W  W] [CHK]
 *
 * D0      = "2" (weight item flag)
 * D1–D6   = PLU code (6 digits, zero-padded)  → "000042"
 * D7–D11  = Weight value (5 digits)            → "01500" = 1500g = 1.500 kg
 * D12     = EAN-13 check digit (auto)
 *
 * Configure WEIGHT_DECIMAL_PLACES to match your scale's setting.
 * Rongta RLS default is 3 decimal places (grams precision).
 *
 * ⚠️  VERIFY_LATER: Confirm byte positions by printing a test label and
 * reading the 13-digit barcode. If PLU/weight are misread, adjust
 * PLU_END and WEIGHT_START constants below.
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

// ⚠️  VERIFY_LATER: adjust these if real barcode shows different layout
const PLU_START = 1;   // inclusive
const PLU_END = 7;     // exclusive  → digits 1–6 = 6-char PLU ("000042")
const WEIGHT_START = 7;
const WEIGHT_END = 12; // exclusive  → digits 7–11 = 5-char weight ("01500")

export interface ParsedWeightBarcode {
  /** The raw 13-digit barcode string */
  raw: string;

  /** PLU code to look up in your products table (matches internalCode in DB) */
  pluCode: string;

  /** Numeric PLU (without leading zeros) */
  pluNumber: number;

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
 * const result = parseWeightBarcode("2000042015001");
 * // result.pluCode    → "000042"
 * // result.pluNumber  → 42
 * // result.weight     → 1.500
 * // result.unit       → "kg"
 * // result.weightDisplay → "1.500 kg"
 */
export function parseWeightBarcode(
  barcode: string,
  config: WeightBarcodeConfig = DEFAULT_CONFIG
): ParsedWeightBarcode | null {
  if (!isWeightBarcode(barcode)) return null;

  // D0 = "2", D1–D6 = PLU (6 chars), D7–D11 = weight (5 chars), D12 = check
  const pluCode = barcode.substring(PLU_START, PLU_END);       // e.g. "000042"
  const weightRaw = barcode.substring(WEIGHT_START, WEIGHT_END); // e.g. "01500"

  const pluNumber = parseInt(pluCode, 10);
  const weightInt = parseInt(weightRaw, 10);

  if (isNaN(pluNumber) || isNaN(weightInt)) return null;

  // e.g. 001250 with 3 decimal places → 1250 / 1000 = 1.250 kg
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
    pluCode,
    pluNumber,
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
 * Formats a PLU number into a 6-digit zero-padded string
 * matching the internalCode field in the products table.
 * @example
 * formatPlu(42) → "000042"
 */
export function formatPlu(plu: number): string {
  return String(plu).padStart(6, "0");
}
