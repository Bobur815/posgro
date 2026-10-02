/**
 * Click in the shift figures: never drawer cash, inside the cashless (card) total — which is what
 * the shift sync sends the server — and broken out on its own for the X/Z report.
 */
const queryRawUnsafe = jest.fn();
jest.mock('../database/sqlite-client', () => ({
  getPrismaClient: () => ({ $queryRawUnsafe: queryRawUnsafe }),
}));
// Kept off the import chain: both reach electron-log (tasks/lessons.md).
jest.mock('./commit-sale', () => ({
  SaleRefusedError: class extends Error {},
  serially: jest.fn(),
}));
jest.mock('../license/license', () => ({ sellingRefusal: jest.fn() }));

import { computeSmenaStats } from './shifts';

beforeEach(() => {
  queryRawUnsafe.mockReset();
  queryRawUnsafe.mockImplementation(async (sql: string) => {
    if (sql.includes('FROM sales')) {
      return [
        { payment_method: 'cash', cnt: 3, total: 300000, discounts: 0 },
        { payment_method: 'card', cnt: 2, total: 200000, discounts: 0 },
        { payment_method: 'uzqr', cnt: 1, total: 50000, discounts: 0 },
        { payment_method: 'click', cnt: 2, total: 80000, discounts: 0 },
      ];
    }
    return [];
  });
});

describe('computeSmenaStats with Click', () => {
  it('keeps Click out of drawer cash and inside the cashless total', async () => {
    const s = await computeSmenaStats('smena-1');
    expect(s.cashSalesAmount).toBe(300000);
    expect(s.cashSalesCount).toBe(3);
    expect(s.cardSalesAmount).toBe(330000); // card + UzQR + Click
    expect(s.cardSalesCount).toBe(5);
    expect(s.totalRevenue).toBe(630000);
  });

  it('breaks Click out without counting it twice', async () => {
    const s = await computeSmenaStats('smena-1');
    expect(s.clickSalesAmount).toBe(80000);
    expect(s.clickSalesCount).toBe(2);
    expect(s.cashSalesAmount + s.cardSalesAmount).toBe(s.totalRevenue);
  });
});
