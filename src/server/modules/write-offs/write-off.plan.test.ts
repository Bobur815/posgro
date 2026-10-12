import { Prisma } from '@prisma/client';
import { planWriteOff, refusalMessage, type WriteOffProduct } from './write-off.plan';

const D = (v: number | string) => new Prisma.Decimal(v);

const milk: WriteOffProduct = {
  id: 1,
  nameRu: 'Молоко',
  nameUz: 'Sut',
  barcode: '4780000000011',
  unit: 'шт',
  stock: D(10),
  cost: D('8000.50'),
};
const cheese: WriteOffProduct = {
  id: 2,
  nameRu: 'Сыр',
  nameUz: 'Pishloq',
  barcode: '4780000000028',
  unit: 'кг',
  stock: D('1.250'),
  cost: null,
};

describe('planWriteOff', () => {
  it('snapshots each line and values it at cost', () => {
    const plan = planWriteOff({ reason: 'EXPIRY', items: [{ productId: 1, quantity: 3 }] }, [
      milk,
      cheese,
    ]);
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.lines).toEqual([
      expect.objectContaining({
        productId: 1,
        productName: 'Молоко',
        productNameUz: 'Sut',
        unit: 'шт',
      }),
    ]);
    expect(plan.lines[0].quantity.toString()).toBe('3');
    expect(plan.totalValue.toString()).toBe('24001.5');
  });

  it('adds nothing to the value for a product without a cost, and keeps fractional quantities exact', () => {
    const plan = planWriteOff(
      {
        reason: 'DAMAGE',
        items: [
          { productId: 2, quantity: 0.25 },
          { productId: 1, quantity: 1 },
        ],
      },
      [milk, cheese],
    );
    expect(plan.ok && plan.totalValue.toString()).toBe('8000.5');
    expect(plan.ok && plan.lines[0].quantity.toString()).toBe('0.25');
  });

  it('allows the whole stock but not a gram more', () => {
    expect(
      planWriteOff({ reason: 'DAMAGE', items: [{ productId: 2, quantity: 1.25 }] }, [cheese]).ok,
    ).toBe(true);
    const over = planWriteOff({ reason: 'DAMAGE', items: [{ productId: 2, quantity: 1.251 }] }, [
      cheese,
    ]);
    expect(over).toEqual({
      ok: false,
      error: {
        code: 'EXCEEDS_STOCK',
        productId: 2,
        product: 'Сыр',
        stock: '1.25',
        quantity: '1.251',
      },
    });
  });

  it('requires a note for OTHER, and a blank one does not count', () => {
    const items = [{ productId: 1, quantity: 1 }];
    expect(planWriteOff({ reason: 'OTHER', items }, [milk])).toEqual({
      ok: false,
      error: { code: 'NOTE_REQUIRED' },
    });
    expect(planWriteOff({ reason: 'OTHER', note: '   ', items }, [milk]).ok).toBe(false);
    const ok = planWriteOff({ reason: 'OTHER', note: ' Kalamush ', items }, [milk]);
    expect(ok.ok && ok.note).toBe('Kalamush');
  });

  it('keeps an optional note for EXPIRY and DAMAGE, null when blank', () => {
    const plan = planWriteOff(
      { reason: 'EXPIRY', note: '', items: [{ productId: 1, quantity: 1 }] },
      [milk],
    );
    expect(plan.ok && plan.note).toBeNull();
  });

  it('refuses a product listed twice, an unknown product and a zero quantity', () => {
    expect(
      planWriteOff(
        {
          reason: 'DAMAGE',
          items: [
            { productId: 1, quantity: 1 },
            { productId: 1, quantity: 2 },
          ],
        },
        [milk],
      ),
    ).toEqual({ ok: false, error: { code: 'DUPLICATE_LINE', productId: 1 } });
    expect(
      planWriteOff({ reason: 'DAMAGE', items: [{ productId: 9, quantity: 1 }] }, [milk]),
    ).toEqual({
      ok: false,
      error: { code: 'UNKNOWN_PRODUCT', productId: 9 },
    });
    expect(
      planWriteOff({ reason: 'DAMAGE', items: [{ productId: 1, quantity: 0 }] }, [milk]),
    ).toEqual({
      ok: false,
      error: { code: 'NOT_POSITIVE', productId: 1 },
    });
  });

  it('names the product and both figures when refusing for stock', () => {
    const plan = planWriteOff({ reason: 'DAMAGE', items: [{ productId: 1, quantity: 11 }] }, [
      milk,
    ]);
    expect(!plan.ok && refusalMessage(plan.error)).toBe(
      'Cannot write off 11 of "Молоко": only 10 in stock',
    );
  });
});
