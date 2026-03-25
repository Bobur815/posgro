/**
 * Tests for weightBarcode.ts
 * Run with: npx jest weightBarcode
 */

import {
  isWeightBarcode,
  parseWeightBarcode,
  calculateWeightPrice,
  validateEan13CheckDigit,
  formatPlu,
} from "./weightBarcode";

// ─── isWeightBarcode ──────────────────────────────────────────────────────────

describe("isWeightBarcode", () => {
  it("detects valid weight barcodes starting with 2", () => {
    expect(isWeightBarcode("2012340012505")).toBe(true);
    expect(isWeightBarcode("2000010005003")).toBe(true);
  });

  it("rejects regular EAN-13 barcodes (not starting with 2)", () => {
    expect(isWeightBarcode("4006381333931")).toBe(false);
    expect(isWeightBarcode("8710398522592")).toBe(false);
  });

  it("rejects barcodes with wrong length", () => {
    expect(isWeightBarcode("201234001250")).toBe(false);   // 12 digits
    expect(isWeightBarcode("20123400125055")).toBe(false); // 14 digits
  });

  it("rejects non-numeric input", () => {
    expect(isWeightBarcode("201234A01250X")).toBe(false);
    expect(isWeightBarcode("")).toBe(false);
  });
});

// ─── parseWeightBarcode ───────────────────────────────────────────────────────

describe("parseWeightBarcode", () => {
  it("parses PLU and weight correctly (Rongta RLS default)", () => {
    // Barcode: 2 000042 01500 X  → PLU=000042, weight=01500/1000=1.500kg
    // Build: "2" + "000042" + "01500" + check
    // ⚠️  VERIFY_LATER: replace test barcode with real printed label number
    const result = parseWeightBarcode("2000042015001");

    expect(result).not.toBeNull();
    expect(result!.pluCode).toBe("000042");
    expect(result!.pluNumber).toBe(42);
    expect(result!.weight).toBe(1.5);
    expect(result!.unit).toBe("kg");
    expect(result!.weightDisplay).toBe("1.500 kg");
  });

  it("parses PLU 000001 with 500g weight", () => {
    // "2" + "000001" + "00500" + check
    const result = parseWeightBarcode("2000001005009");
    expect(result!.pluCode).toBe("000001");
    expect(result!.pluNumber).toBe(1);
    expect(result!.weight).toBe(0.5);
    expect(result!.weightDisplay).toBe("0.500 kg");
  });

  it("returns null for non-weight barcodes", () => {
    expect(parseWeightBarcode("4006381333931")).toBeNull();
  });

  it("outputs grams when configured", () => {
    const result = parseWeightBarcode("2000042015001", {
      weightDecimalPlaces: 3,
      outputUnit: "g",
    });
    expect(result!.weight).toBe(1500);
    expect(result!.weightDisplay).toBe("1500 g");
  });

  it("handles 2-decimal-place scales", () => {
    const result = parseWeightBarcode("2000042015001", {
      weightDecimalPlaces: 2,
      outputUnit: "kg",
    });
    // 01500 / 100 = 15.00 kg
    expect(result!.weight).toBe(15);
  });
});

// ─── calculateWeightPrice ─────────────────────────────────────────────────────

describe("calculateWeightPrice", () => {
  it("calculates price for 1.250 kg at 12000 UZS/kg", () => {
    expect(calculateWeightPrice(12000, 1.25)).toBe(15000);
  });

  it("calculates price for 0.500 kg at 45000 UZS/kg", () => {
    expect(calculateWeightPrice(45000, 0.5)).toBe(22500);
  });

  it("handles sub-gram precision without floating point errors", () => {
    const price = calculateWeightPrice(10000, 0.333);
    expect(price).toBe(3330);
  });
});

// ─── validateEan13CheckDigit ──────────────────────────────────────────────────

describe("validateEan13CheckDigit", () => {
  it("validates correct check digits", () => {
    expect(validateEan13CheckDigit("4006381333931")).toBe(true);
    expect(validateEan13CheckDigit("5901234123457")).toBe(true);
  });

  it("rejects invalid check digits", () => {
    expect(validateEan13CheckDigit("4006381333930")).toBe(false);
    expect(validateEan13CheckDigit("4006381333939")).toBe(false);
  });

  it("rejects short barcodes", () => {
    expect(validateEan13CheckDigit("400638133393")).toBe(false);
  });
});

// ─── formatPlu ────────────────────────────────────────────────────────────────

describe("formatPlu", () => {
  it("pads PLU numbers to 6 digits", () => {
    expect(formatPlu(1)).toBe("000001");
    expect(formatPlu(42)).toBe("000042");
    expect(formatPlu(12345)).toBe("012345");
  });
});
