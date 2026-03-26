/**
 * Weight Barcode Parser for Rongta RLS Label Scale
 *
 * Rongta RLS scales print EAN-13 barcodes using Barcode Type 15.
 * The barcode encodes the product LFCode (PLU) and the weight.
 *
 * Barcode Type 15 Format (EAN-13, 13 digits):
 * Position:  0   1 2 3 4 5 6 7   8 9 10 11   12
 * Content:  [2] [0 P P P P P P] [W W  W  W] [CHK]
 *
 * D0      = "2" (dept code / weight item flag)
 * D1–D7   = LFCode (7 digits) = "0" + 6-digit internalCode → e.g. "0000001"
 * D8–D11  = Weight value (4 digits, W.WWW kg)  → "1250" = 1.250 kg
 * D12     = EAN-13 check digit (auto)
 *
 * We extract internalCode from D2–D7 (skip D1 which is always "0").
 *
 * Configure WEIGHT_DECIMAL_PLACES to match your scale's setting.
 * Rongta RLS default is 3 decimal places (0.001 kg precision).
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

// Byte layout per Rongta RLS Barcode Type 15 spec
const PLU_START = 2;   // inclusive — skip D0 ("2") and D1 (leading "0" of LFCode)
const PLU_END = 8;     // exclusive → digits 2–7 = 6-char internalCode ("000001")
const WEIGHT_START = 8;
const WEIGHT_END = 12; // exclusive → digits 8–11 = 4-char weight ("1250" = 1.250 kg)

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
 * const result = parseWeightBarcode("2000004215002");
 * // Barcode: 2 | 0000042 | 1500 | 2
 * //          ↑   LFCode   weight  check
 * // result.pluCode    → "000042"   (internalCode in DB)
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

  // D0="2", D1–D7=LFCode(7), D8–D11=weight(4), D12=check
  const pluCode = barcode.substring(PLU_START, PLU_END);         // e.g. "000042" (D2–D7)
  const weightRaw = barcode.substring(WEIGHT_START, WEIGHT_END); // e.g. "1250" (D8–D11)

  const pluNumber = parseInt(pluCode, 10);
  const weightInt = parseInt(weightRaw, 10);

  if (isNaN(pluNumber) || isNaN(weightInt)) return null;

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
