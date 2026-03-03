/**
 * EAN-13 weighted barcode parser and generator.
 *
 * Format (prefix 20–29 = weighted):
 *   Digits 0–1:  prefix (e.g. "20")
 *   Digits 2–6:  5-digit internal product code
 *   Digits 7–11: 5-digit weight in grams (e.g. 01500 = 1.500 kg)
 *   Digit 12:    EAN-13 check digit
 *
 * Example: 2000001015000
 *   prefix=20, code=00001, weight=01500g (1.5kg)
 */

export interface ParsedBarcode {
  isWeighted: boolean;
  productCode: string | null;  // 5-digit string
  weightKg: number | null;
  originalBarcode: string;
}

/** Compute EAN-13 check digit from the first 12 digits (as string). */
export function calculateEan13Check(digits: string): number {
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    const d = parseInt(digits[i], 10);
    sum += i % 2 === 0 ? d : d * 3;
  }
  const mod = sum % 10;
  return mod === 0 ? 0 : 10 - mod;
}

/**
 * Parse a scanned barcode string.
 * Returns isWeighted=true if prefix is 20–29 and the barcode is valid 13-digit EAN.
 */
export function parseBarcode(barcode: string): ParsedBarcode {
  const trimmed = barcode.trim();

  // Must be exactly 13 digits
  if (!/^\d{13}$/.test(trimmed)) {
    return { isWeighted: false, productCode: null, weightKg: null, originalBarcode: barcode };
  }

  const prefix = parseInt(trimmed.substring(0, 2), 10);
  const isWeighted = prefix >= 20 && prefix <= 29;

  if (!isWeighted) {
    return { isWeighted: false, productCode: null, weightKg: null, originalBarcode: barcode };
  }

  // Validate check digit
  const expectedCheck = calculateEan13Check(trimmed.substring(0, 12));
  const actualCheck = parseInt(trimmed[12], 10);
  if (expectedCheck !== actualCheck) {
    // Check digit mismatch — still treat as weighted but mark invalid
    return { isWeighted: false, productCode: null, weightKg: null, originalBarcode: barcode };
  }

  const productCode = trimmed.substring(2, 7);        // digits 2–6
  const weightGrams = parseInt(trimmed.substring(7, 12), 10); // digits 7–11
  const weightKg = weightGrams / 1000;

  return { isWeighted: true, productCode, weightKg, originalBarcode: barcode };
}

/**
 * Generate an internal EAN-13 barcode for products without a supplier barcode.
 * Uses prefix 400 (GS1 internal-use range), avoiding 20-29 reserved for weighted items.
 */
export function generateProductBarcode(): string {
  const base =
    "400" +
    String(Math.floor(Math.random() * 1_000_000_000)).padStart(9, "0");
  return base + String(calculateEan13Check(base));
}

/**
 * Generate a weighted EAN-13 barcode.
 * @param productCode  5-digit internal code (e.g. "00001")
 * @param weightGrams  weight in grams (integer, e.g. 1500 for 1.5 kg)
 * @param prefix       EAN prefix 20–29 (default 20)
 */
export function generateWeightedBarcode(
  productCode: string,
  weightGrams: number,
  prefix: number = 20,
): string {
  const p = String(Math.max(20, Math.min(29, prefix))).padStart(2, '0');
  const code = productCode.padStart(5, '0').substring(0, 5);
  const weight = String(Math.round(weightGrams)).padStart(5, '0').substring(0, 5);
  const body = `${p}${code}${weight}`;
  const check = calculateEan13Check(body);
  return `${body}${check}`;
}
