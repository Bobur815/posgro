import {
  calculateWeightPrice,
  formatGoodsCode,
  isWeightBarcode,
  parseWeightBarcode,
  validateEan13CheckDigit,
} from './weightBarcode';

/**
 * The byte layout of a Rongta RLS label, pinned to barcodes scanned off real printed labels.
 *
 * This is the one part of the scale integration that is actually settled (`tasks/scale-todo.md`
 * §3). The port and the PLU-upload protocol are still unknown and stubbed — but none of that
 * touches reading a label, which is what the till does on every weighed sale.
 *
 * The layout was worked out once from two labels and then written into a comment. A comment does
 * not fail when someone adjusts `PLU_START`, so these are the real labels, asserted:
 *
 *   2500008903160 → product 89, 0.316 kg
 *   2500008522583 → product 85, 2.258 kg
 *
 * Their EAN-13 check digits both verify, which is independent evidence the field boundaries are
 * right: a wrong split would still parse, but the check digit could not agree by accident.
 */

const REAL_LABELS = [
  { barcode: '2500008903160', productIdNum: 89, weight: 0.316, display: '0.316 kg' },
  { barcode: '2500008522583', productIdNum: 85, weight: 2.258, display: '2.258 kg' },
] as const;

describe('parseWeightBarcode, against labels the scale actually printed', () => {
  it.each(REAL_LABELS)(
    '$barcode → product $productIdNum, $weight kg',
    ({ barcode, productIdNum, weight, display }) => {
      const parsed = parseWeightBarcode(barcode);

      expect(parsed).not.toBeNull();
      expect(parsed!.productIdNum).toBe(productIdNum);
      expect(parsed!.productId).toBe(String(productIdNum).padStart(6, '0'));
      expect(parsed!.weight).toBeCloseTo(weight, 3);
      expect(parsed!.unit).toBe('kg');
      expect(parsed!.weightDisplay).toBe(display);
      expect(parsed!.raw).toBe(barcode);
    },
  );

  // Independent of the parser: if these fail, the barcodes above were mistranscribed and every
  // expectation built on them is worthless.
  it.each(REAL_LABELS)('$barcode is a valid EAN-13', ({ barcode }) => {
    expect(validateEan13CheckDigit(barcode)).toBe(true);
  });

  /**
   * D1 is the section digit, set on the scale and free to vary between shops. It is *not* part of
   * the product id, and reading it as one would send every lookup to the wrong product.
   */
  it('ignores the section digit', () => {
    const sectionFive = parseWeightBarcode('2500008903160');
    const sectionZero = parseWeightBarcode('2000008903160');

    expect(sectionZero!.productIdNum).toBe(sectionFive!.productIdNum);
    expect(sectionZero!.weight).toBeCloseTo(sectionFive!.weight, 3);
  });

  it('keeps the leading zeros of the padded id while giving a usable number', () => {
    // 2 | 5 | 000010 | 0316 | 4 — constructed, so its check digit is asserted too rather than
    // letting a mistyped fixture quietly stand in for a real one.
    expect(validateEan13CheckDigit('2500001003164')).toBe(true);

    const parsed = parseWeightBarcode('2500001003164');
    expect(parsed!.productId).toBe('000010');
    expect(parsed!.productIdNum).toBe(10);
    expect(parsed!.weight).toBeCloseTo(0.316, 3);
  });

  it('reads a zero weight rather than failing on it', () => {
    const parsed = parseWeightBarcode('2500008900000');
    expect(parsed!.weight).toBe(0);
    expect(parsed!.weightDisplay).toBe('0.000 kg');
  });

  it('reads the largest weight the four digits allow', () => {
    const parsed = parseWeightBarcode('2500008999990');
    expect(parsed!.weight).toBeCloseTo(9.999, 3);
  });
});

describe('scale configuration', () => {
  // Two decimal places means 10-gram precision, which some scales are set to. Same digits,
  // different weight — so this is a setting that must match the scale or every price is wrong.
  it('reads the same digits as 10-gram precision when the scale is set that way', () => {
    const parsed = parseWeightBarcode('2500008522583', {
      weightDecimalPlaces: 2,
      outputUnit: 'kg',
    });
    expect(parsed!.weight).toBeCloseTo(22.58, 2);
    expect(parsed!.weightDisplay).toBe('22.58 kg');
  });

  it('converts to grams when asked', () => {
    const parsed = parseWeightBarcode('2500008522583', {
      weightDecimalPlaces: 3,
      outputUnit: 'g',
    });
    expect(parsed!.weight).toBeCloseTo(2258, 0);
    expect(parsed!.weightDisplay).toBe('2258 g');
  });
});

describe('isWeightBarcode', () => {
  it('accepts a real label', () => {
    expect(isWeightBarcode('2500008522583')).toBe(true);
  });

  // An ordinary retail EAN-13 must not be mistaken for a weighed item — it would be looked up as
  // a product id that has nothing to do with it.
  it.each([
    ['a normal product EAN-13', '4780000000001'],
    ['too short', '250000852258'],
    ['too long', '25000085225831'],
    ['not digits', '25000085225A3'],
    ['empty', ''],
  ])('rejects %s', (_label, barcode) => {
    expect(isWeightBarcode(barcode)).toBe(false);
    expect(parseWeightBarcode(barcode)).toBeNull();
  });

  it('rejects a non-string without throwing', () => {
    expect(isWeightBarcode(undefined as unknown as string)).toBe(false);
  });
});

describe('calculateWeightPrice', () => {
  it('prices a weighed item', () => {
    expect(calculateWeightPrice(12500, 1.25)).toBe(15625);
  });

  it('prices the real 2.258 kg label', () => {
    expect(calculateWeightPrice(12000, 2.258)).toBe(27096);
  });

  // Money, so the rounding is asserted rather than assumed.
  it('rounds to two decimal places', () => {
    expect(calculateWeightPrice(1000, 0.3333)).toBe(333.3);
    expect(calculateWeightPrice(999, 0.123)).toBeCloseTo(122.88, 2);
  });

  it('is zero for a zero weight', () => {
    expect(calculateWeightPrice(12000, 0)).toBe(0);
  });
});

describe('formatGoodsCode', () => {
  it.each([
    [85, '000085'],
    [1, '000001'],
    [999999, '999999'],
  ])('%i → %s', (code, expected) => {
    expect(formatGoodsCode(code)).toBe(expected);
  });
});

describe('validateEan13CheckDigit', () => {
  it('rejects a barcode whose check digit has been altered', () => {
    expect(validateEan13CheckDigit('2500008522583')).toBe(true);
    expect(validateEan13CheckDigit('2500008522584')).toBe(false);
  });

  it.each([['too short', '250000852258'], ['not digits', '25000085225A3']])(
    'rejects %s',
    (_label, barcode) => {
      expect(validateEan13CheckDigit(barcode)).toBe(false);
    },
  );
});
