import { buildRongtaTxp, scaleCode, toScaleName, TXP_NAME_MAX, type TxpSourceProduct } from './rongta-txp';

/**
 * Rows exactly as the RLS1000 PLU manager wrote them when it re-saved C:\RLS\rtPLU_EN.TXP.
 * We deliberately change two columns: 4 (barcode type) is the store's format 15, not the sample's
 * 2; and 9 (shelf-life days) is 0, because the sample's 15 is a factory placeholder that would put
 * an invented expiry date on food labels. Prices are in 1/100: the sample's "90" is 0.90.
 */
const PLU_MANAGER_ROW_1 =
  '1\tChinese cabbage\t1\t1\t2\t90\t4\t21\t0.000\t15\t0\t0.000\t0\t0\t0\t0\tD0\t0\t0\t\t\t0\t0\t0.0\t0\t0\t\t0.0000\t0\t\t\t\t\t\t\t\t\t\t3\t0\t0\t0\t0\t0\t0\t0.00\t0\t0.000\t0.000\t0\t\t0\t0.00\t0\t0\t0\t0.00\t0';
const PLU_MANAGER_ROW_2 =
  '2\tCelery\t2\t2\t2\t140\t4\t21\t0.000\t15\t0\t0.000\t0\t0\t0\t0\tD0\t0\t0\t\t\t0\t0\t0.0\t0\t0\t\t0.0000\t0\t\t\t\t\t\t\t\t\t\t3\t0\t0\t0\t0\t0\t0\t0.00\t0\t0.000\t0.000\t0\t\t0\t0.00\t0\t0\t0\t0.00\t0';

const OURS: Record<number, string> = { 4: '15', 9: '0' };
const asWeWriteIt = (row: string) => row.split('\t').map((v, i) => OURS[i] ?? v).join('\t');

const product = (p: Partial<TxpSourceProduct> & { id: number }): TxpSourceProduct => ({
  storeProductCode: null,
  internalCode: String(p.id).padStart(6, '0'),
  nameUz: `Product ${p.id}`,
  price: 10000,
  ...p,
});

const cols = (text: string, line = 0) => text.split('\r\n')[line].split('\t');

describe('buildRongtaTxp', () => {
  it('reproduces the PLU manager’s own rows, column for column', () => {
    const { text } = buildRongtaTxp(
      [product({ id: 1, nameUz: 'Chinese cabbage', price: 0.9 }), product({ id: 2, nameUz: 'Celery', price: 1.4 })],
      new Set(),
    );
    expect(text).toBe(`${asWeWriteIt(PLU_MANAGER_ROW_1)}\r\n${asWeWriteIt(PLU_MANAGER_ROW_2)}\r\n`);
  });

  it('writes 58 columns per row, CRLF, pure ASCII', () => {
    const { text } = buildRongtaTxp([product({ id: 5, nameUz: 'Yong‘oqli pechenye' })], new Set());
    expect(cols(text)).toHaveLength(58);
    expect(text.endsWith('\r\n')).toBe(true);
    expect(text.replace(/\r\n/g, '')).not.toMatch(/[\n\r]/);
    expect(/^[\x09\x0a\x0d\x20-\x7e]*$/.test(text)).toBe(true);
  });

  it('LF code is the internal code; PLU and item code are what the till resolves labels by', () => {
    const { text } = buildRongtaTxp(
      [
        product({ id: 89, storeProductCode: 14, internalCode: '000002', nameUz: 'Banan' }),
        product({ id: 88, internalCode: '000001', nameUz: 'Shakar' }),
      ],
      new Set([14]),
    );
    const [banan, shakar] = [cols(text, 0), cols(text, 1)];
    // [PLU, name, LF code, item code]
    expect(banan.slice(0, 4)).toEqual(['14', 'Banan', '2', '14']);
    expect(shakar.slice(0, 4)).toEqual(['88', 'Shakar', '1', '88']);
  });

  it('writes the price per kg in 1/100 — 23000 sum shows as 23000,00 — with barcode type 15, unit Kg', () => {
    const row = cols(buildRongtaTxp([product({ id: 3, price: 23000 })], new Set()).text);
    expect(row[5]).toBe('2300000');
    expect(row[4]).toBe('15');
    expect(row[6]).toBe('4');
    expect(cols(buildRongtaTxp([product({ id: 3, price: 18000.4 })], new Set()).text)[5]).toBe('1800040');
  });

  it('sorts rows by code', () => {
    const { text } = buildRongtaTxp(
      [product({ id: 300 }), product({ id: 7, storeProductCode: 2 }), product({ id: 40 })],
      new Set([2]),
    );
    expect(text.trim().split('\r\n').map((l) => l.split('\t')[0])).toEqual(['2', '40', '300']);
  });

  describe('skips what would print a wrong or unscannable label', () => {
    it('an older product whose id is another product’s store code — its label would scan as the other one', () => {
      const r = buildRongtaTxp([product({ id: 14, nameUz: 'Olma' })], new Set([14]));
      expect(r.exported).toBe(0);
      expect(r.skipped).toEqual([{ id: 14, name: 'Olma', reason: 'code_taken' }]);
    });

    it('a product using its own store code is not a collision', () => {
      expect(buildRongtaTxp([product({ id: 500, storeProductCode: 14 })], new Set([14])).exported).toBe(1);
    });

    it('a code longer than the 6 digits a label carries', () => {
      expect(buildRongtaTxp([product({ id: 1_000_000 })], new Set()).skipped[0].reason).toBe('code_too_long');
    });

    it('a second product with the same code', () => {
      const r = buildRongtaTxp(
        [product({ id: 1, storeProductCode: 9 }), product({ id: 2, storeProductCode: 9 })],
        new Set([9]),
      );
      expect(r.exported).toBe(1);
      expect(r.skipped.map((s) => [s.id, s.reason])).toEqual([[2, 'duplicate_code']]);
    });

    it('a product with no internal code to use as its LF code', () => {
      const r = buildRongtaTxp(
        [product({ id: 2427, internalCode: null, nameUz: 'Tarvuz' }), product({ id: 5, internalCode: 'A1' })],
        new Set(),
      );
      expect(r.exported).toBe(0);
      expect(r.skipped.map((s) => [s.id, s.reason])).toEqual([
        [5, 'no_internal_code'],
        [2427, 'no_internal_code'],
      ]);
    });

    it('a second product with the same LF code', () => {
      const r = buildRongtaTxp(
        [product({ id: 1, internalCode: '000007' }), product({ id: 2, internalCode: '7' })],
        new Set(),
      );
      expect(r.skipped.map((s) => [s.id, s.reason])).toEqual([[2, 'duplicate_code']]);
    });

    it('a product with no printable Uzbek name', () => {
      expect(buildRongtaTxp([product({ id: 1, nameUz: '  ' })], new Set()).skipped[0].reason).toBe('no_name');
      expect(buildRongtaTxp([product({ id: 2, nameUz: 'Бек доктор' })], new Set()).exported).toBe(1);
    });
  });

  it('returns an empty file when nothing is exportable', () => {
    expect(buildRongtaTxp([], new Set())).toEqual({ text: '', exported: 0, skipped: [] });
  });
});

describe('toScaleName', () => {
  it('turns Uzbek apostrophe letters into ASCII', () => {
    expect(toScaleName('Yong‘oqli pechenye ')).toBe("Yong'oqli pechenye");
    expect(toScaleName('Gʻisht oʼrik')).toBe("G'isht o'rik");
  });

  it('cannot break a column: tabs and newlines become spaces', () => {
    expect(toScaleName('Olma\tqizil\r\nyangi')).toBe('Olma qizil yangi');
  });

  it('transliterates Cyrillic typed into the Uzbek name instead of dropping it', () => {
    expect(toScaleName('Сгущенное молоко')).toBe('Sgushennoe moloko');
    expect(toScaleName('Zarqand глазурь шедевр')).toBe('Zarqand glazur shedevr');
    expect(toScaleName('Ёнғоқли печенйе')).toBe("Yong'oqli pechenye");
    expect(toScaleName('ЧАЙ Шафтоли')).toBe('ChAY Shaftoli');
    expect(toScaleName('Топлёное')).toBe('Toplyonoe');
  });

  it('drops accents and anything else non-ASCII', () => {
    expect(toScaleName('Café ☕ №1')).toBe('Cafe No1');
  });

  it('fits the 72-byte name field', () => {
    expect(toScaleName('x'.repeat(100))).toHaveLength(TXP_NAME_MAX);
  });
});

describe('scaleCode', () => {
  it('prefers the store code', () => {
    expect(scaleCode({ id: 89, storeProductCode: 14 })).toBe(14);
    expect(scaleCode({ id: 88, storeProductCode: null })).toBe(88);
  });
});
