import { isCashTender, isClickTender, isFiscalCashTender } from './payment-methods';

describe('tender classification', () => {
  it('Click is fiscal cash but never drawer cash', () => {
    expect(isFiscalCashTender('click')).toBe(true);
    expect(isFiscalCashTender('CLICK')).toBe(true);
    expect(isCashTender('click')).toBe(false);
    expect(isClickTender('click')).toBe(true);
  });

  it('cash is both; card, UzQR, debt and unknown values are neither', () => {
    expect(isFiscalCashTender('cash')).toBe(true);
    expect(isCashTender('cash')).toBe(true);
    for (const m of ['card', 'uzqr', 'debt', 'mixed', '', null, undefined]) {
      expect(isFiscalCashTender(m)).toBe(false);
      expect(isCashTender(m)).toBe(false);
    }
  });
});
