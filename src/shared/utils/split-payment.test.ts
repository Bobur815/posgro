import { linesToStore, remainingFor, splitState, tenderAmounts } from './split-payment';

describe('tenderAmounts', () => {
  it('puts a single-tender sale wholly on its payment method', () => {
    expect(tenderAmounts({ paymentMethod: 'card', paidAmount: 100000 })).toEqual({
      cash: 0,
      card: 100000,
      uzqr: 0,
      click: 0,
      other: 0,
    });
    // Nasiya part-paid: only the paid part counts.
    expect(tenderAmounts({ paymentMethod: 'cash', paidAmount: 30000 }).cash).toBe(30000);
  });

  it('reads the lines of a split sale and ignores payment_method', () => {
    const t = tenderAmounts({ paymentMethod: 'mixed', paidAmount: 100000 }, [
      { method: 'cash', amount: 55000 },
      { method: 'click', amount: 45000 },
    ]);
    expect(t).toMatchObject({ cash: 55000, click: 45000, card: 0 });
  });

  it('never counts debt or unknown tenders as money', () => {
    expect(tenderAmounts({ paymentMethod: 'debt', paidAmount: 0 }).other).toBe(0);
    expect(tenderAmounts({ paymentMethod: 'mixed', paidAmount: 10 }).other).toBe(10);
  });

  it('adds fractions without float drift', () => {
    const t = tenderAmounts({ paymentMethod: 'mixed', paidAmount: 0.3 }, [
      { method: 'cash', amount: 0.1 },
      { method: 'cash', amount: 0.2 },
    ]);
    expect(t.cash).toBe(0.3);
  });
});

describe('splitState / remainingFor — the user story', () => {
  it('100 000 = 55 000 cash typed + 45 000 card from the remaining button', () => {
    const lines = [
      { method: 'cash', amount: 55000 },
      { method: 'card', amount: 0 },
    ];
    expect(remainingFor(100000, lines, 'card')).toBe(45000);
    lines[1].amount = remainingFor(100000, lines, 'card');
    expect(splitState(100000, lines)).toEqual({
      entered: 100000,
      remaining: 0,
      change: 0,
      canPay: true,
      problem: 'none',
    });
  });

  it('refuses a split that does not cover the total', () => {
    const s = splitState(100000, [
      { method: 'cash', amount: 50000 },
      { method: 'card', amount: 40000 },
    ]);
    expect(s).toMatchObject({ canPay: false, problem: 'short', remaining: 10000, change: 0 });
  });

  it('gives change only from cash', () => {
    const s = splitState(100000, [
      { method: 'cash', amount: 60000 },
      { method: 'card', amount: 45000 },
    ]);
    expect(s).toMatchObject({ canPay: true, change: 5000 });
  });

  it('refuses non-cash lines that exceed the total — no change from a card', () => {
    const s = splitState(100000, [
      { method: 'card', amount: 70000 },
      { method: 'click', amount: 40000 },
    ]);
    expect(s).toMatchObject({ canPay: false, problem: 'nonCashOver' });
  });

  it('refuses an empty split', () => {
    expect(splitState(100000, [{ method: 'cash', amount: 0 }]).problem).toBe('empty');
  });
});

describe('linesToStore', () => {
  it('stores cash net of change, so the rows add up to the receipt', () => {
    expect(
      linesToStore(100000, [
        { method: 'cash', amount: 60000 },
        { method: 'card', amount: 45000 },
        { method: 'click', amount: 0 },
      ]),
    ).toEqual([
      { method: 'cash', amount: 55000 },
      { method: 'card', amount: 45000 },
    ]);
  });

  it('throws on a split that does not cover the total', () => {
    expect(() => linesToStore(100000, [{ method: 'cash', amount: 1 }])).toThrow();
  });
});
