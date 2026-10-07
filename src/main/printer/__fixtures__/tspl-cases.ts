import type { TsplPrintRequest } from '../tspl-builder';

/**
 * Price-tag requests whose spooler output was captured from tspl-printer.ts *before* the builder
 * moved to tspl-builder.ts (tspl-spooler.json). The test rebuilds them and compares bytes, so the
 * move cannot change what the Windows-printer path sends.
 *
 * Dates carry noon UTC so `toLocaleDateString` gives the same day in any time zone.
 */
const allElements: TsplPrintRequest['elements'] = {
  name: true,
  price: true,
  unit: true,
  barcode: true,
  articleId: true,
  pluCode: true,
  productionDate: true,
  expiryDate: true,
  customText1: true,
  customText2: true,
  customText1Value: 'Акция',
  customText2Value: 'Rahmat!',
};

export const CASES: Record<string, TsplPrintRequest> = {
  defaultRu: {
    items: [
      {
        productNameRu: 'Молоко Nestle 1л',
        productNameUz: 'Sut Nestle 1l',
        price: 12000,
        barcode: '4780047860466',
        unit: 'шт',
        amount: 1,
        copies: 2,
        productType: 'REGULAR',
      },
    ],
    widthMm: 40,
    heightMm: 30,
    lang: 'ru',
    elements: {
      ...allElements,
      unit: false,
      articleId: false,
      pluCode: false,
      productionDate: false,
      expiryDate: false,
      customText1: false,
      customText2: false,
    },
  },
  weightedUzAllElements: {
    items: [
      {
        productNameRu: 'Сыр Голландский весовой очень длинное название',
        productNameUz: "Golland pishlog'i o'g'irlikda, juda uzun nom",
        price: 98500,
        barcode: '2000000000001',
        unit: 'кг',
        amount: 1.25,
        copies: 1,
        productType: 'BULK_WEIGHTED',
        articleId: 123,
        pluCode: '00042',
        productionDate: '2025-01-01T12:00:00.000Z',
        expiryDate: '2025-02-01T12:00:00.000Z',
      },
      {
        productNameRu: 'Хлеб',
        productNameUz: '',
        price: 4000,
        barcode: '12345',
        amount: 1,
        copies: 3,
      },
    ],
    widthMm: 58,
    heightMm: 40,
    gapMm: 2,
    lang: 'uz',
    fontSize: 18,
    fontWeight: 700,
    elements: allElements,
  },
  smallLabel: {
    items: [
      {
        productNameRu: 'Вода «Ёлочка» 0,5"',
        productNameUz: 'Suv',
        price: 3500,
        unit: 'л',
        amount: 1,
        copies: 1,
      },
    ],
    widthMm: 30,
    heightMm: 20,
    lang: 'ru',
    fontSize: 24,
    elements: { ...allElements, barcode: false },
  },
};
