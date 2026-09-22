import {
  buildSampleReceiptHTML,
  receiptShows,
  RECEIPT_SHOW_KEYS,
  type ReceiptSettings,
} from './receipt-html';

/** What each tick in Receipt settings shows or hides on the printed receipt. */

const base: ReceiptSettings = {
  receipt_width: '80',
  receipt_language: 'ru',
  receipt_header: '',
  receipt_footer: '',
  store_name: 'Магазин Мир',
  store_address: 'ул. Навои 5',
  store_phone: '998901234567',
  store_stir: '123456789',
};

const receipt = (over: Partial<ReceiptSettings> = {}) => buildSampleReceiptHTML({ ...base, ...over });

describe('receiptShows', () => {
  it('shows a part unless it was switched off', () => {
    expect(receiptShows({}, 'receipt_show_payment')).toBe(true);
    expect(receiptShows({ receipt_show_payment: 'true' }, 'receipt_show_payment')).toBe(true);
    expect(receiptShows({ receipt_show_payment: 'false' }, 'receipt_show_payment')).toBe(false);
  });
});

describe('the receipt', () => {
  // Every till before these settings existed has none of the keys: its receipt must not change.
  it('shows everything when nothing was ever saved', () => {
    const html = receipt();
    expect(html).toContain('Магазин Мир');
    expect(html).toContain('ул. Навои 5');
    expect(html).toContain('STIR: 123456789');
    expect(html).toContain('Оплата');
  });

  it.each([
    ['receipt_show_store_name', 'Магазин Мир'],
    ['receipt_show_store_address', 'ул. Навои 5'],
    ['receipt_show_store_stir', 'STIR: 123456789'],
    ['receipt_show_payment', 'Оплата'],
  ] as const)('leaves out what %s switches off', (key, text) => {
    expect(receipt({ [key]: 'false' })).not.toContain(text);
  });

  it('leaves out the phone when switched off', () => {
    const shown = receipt();
    const hidden = receipt({ receipt_show_store_phone: 'false' });
    expect(shown.length).toBeGreaterThan(hidden.length);
    expect(hidden).not.toMatch(/901\s?23/);
  });

  it('keeps the rest when one part is switched off', () => {
    const html = receipt({ receipt_show_store_name: 'false' });
    expect(html).toContain('ул. Навои 5');
    expect(html).toContain('Оплата');
  });

  it('has a key for each tick on the settings page', () => {
    expect(RECEIPT_SHOW_KEYS).toHaveLength(5);
  });
});
