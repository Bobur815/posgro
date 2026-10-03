import { summarizeReceipts } from './receipts-summary';

describe('summarizeReceipts', () => {
  it('sums money, not receipts, per tender', () => {
    const s = summarizeReceipts([
      { finalAmount: 10000, paidAmount: 10000, paymentMethod: 'cash' },
      { finalAmount: '25000.50', paidAmount: '25000.50', paymentMethod: 'card' },
      { finalAmount: 5000, paidAmount: 5000, paymentMethod: 'uzqr' },
    ]);
    expect(s.total).toBe(40000.5);
    expect(s.tenders).toEqual({ cash: 10000, card: 25000.5, uzqr: 5000, click: 0 });
  });

  it('splits a mixed receipt by its payment lines', () => {
    const s = summarizeReceipts([
      {
        finalAmount: 100000,
        paidAmount: 100000,
        paymentMethod: 'mixed',
        payments: [
          { method: 'cash', amount: 55000 },
          { method: 'click', amount: 45000 },
        ],
      },
    ]);
    expect(s.tenders).toEqual({ cash: 55000, card: 0, uzqr: 0, click: 45000 });
  });

  it('counts the full receipt in total but only the paid part in its tender', () => {
    const s = summarizeReceipts([
      { finalAmount: 50000, paidAmount: 20000, debtAmount: 30000, paymentMethod: 'cash' },
      { finalAmount: 40000, paidAmount: 0, debtAmount: 40000, paymentMethod: 'debt' },
    ]);
    expect(s.total).toBe(90000);
    expect(s.debt).toBe(70000);
    expect(s.tenders.cash).toBe(20000);
  });

  it('derives the paid part when an older API sends no paidAmount', () => {
    const s = summarizeReceipts([{ finalAmount: 50000, debtAmount: 30000, paymentMethod: 'card' }]);
    expect(s.tenders.card).toBe(20000);
  });

  it('adds nasiya paid back to the tender it arrived in', () => {
    const s = summarizeReceipts(
      [{ finalAmount: 10000, paidAmount: 10000, paymentMethod: 'cash' }],
      [
        { amount: -30000, paymentMethod: 'CASH' },
        { amount: '-15000', paymentMethod: 'CARD' },
      ],
    );
    expect(s.tenders).toMatchObject({ cash: 40000, card: 15000 });
    expect(s.debtPaidBack).toBe(45000);
    expect(s.total).toBe(10000);
  });

  it('computes margin from cost, and 0 with no revenue', () => {
    const s = summarizeReceipts([
      { finalAmount: 10000, paymentMethod: 'cash', totalCost: 7500 },
      { finalAmount: 10000, paymentMethod: 'cash', totalCost: null },
    ]);
    expect(s.margin).toBeCloseTo(62.5);
    expect(summarizeReceipts([]).margin).toBe(0);
  });

  it('adds fractions without float drift', () => {
    const s = summarizeReceipts([
      { finalAmount: 0.1, paymentMethod: 'cash' },
      { finalAmount: 0.2, paymentMethod: 'cash' },
    ]);
    expect(s.total).toBe(0.3);
    expect(s.tenders.cash).toBe(0.3);
  });
});
