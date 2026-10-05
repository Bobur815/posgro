import { duplicateCodeLines, labelsPerLine } from './fiscal-labels';

describe('labelsPerLine', () => {
  it('gives two lines of the same drink their own codes', () => {
    const items = [{ barcode: '478' }, { barcode: '111' }, { barcode: '478' }];
    const labels = [
      { barcode: '478', label: 'CODE-A' },
      { barcode: '478', label: 'CODE-B' },
    ];
    expect(labelsPerLine(items, labels)).toEqual(['CODE-A', undefined, 'CODE-B']);
  });

  it('leaves a line without a code when there are fewer codes than lines', () => {
    expect(
      labelsPerLine([{ barcode: '478' }, { barcode: '478' }], [{ barcode: '478', label: 'X' }]),
    ).toEqual(['X', undefined]);
  });

  it('ignores malformed entries', () => {
    const labels = [{ barcode: '478', label: '' }, null as never, { barcode: '478', label: 'Y' }];
    expect(labelsPerLine([{ barcode: '478' }], labels)).toEqual(['Y']);
  });
});

describe('duplicateCodeLines', () => {
  const items = [
    { barcode: '478', productName: 'Coca-Cola 1L' },
    { barcode: '478', productName: 'Coca-Cola 1L' },
    { barcode: '111', productName: 'Sigaret' },
  ];

  it('names the code that was sent for every pack and the ones REGOS never got', () => {
    const labels = [
      { barcode: '478', label: 'A' },
      { barcode: '111', label: 'X' },
      { barcode: '478', label: 'B' },
      { barcode: '478', label: 'C' },
    ];
    expect(duplicateCodeLines(labels, items)).toEqual([
      { barcode: '478', productName: 'Coca-Cola 1L', packs: 3, sentCode: 'C', unsentCodes: ['A', 'B'] },
    ]);
  });

  it('finds nothing in a receipt with one pack per product', () => {
    expect(duplicateCodeLines([{ barcode: '478', label: 'A' }, { barcode: '111', label: 'X' }], items)).toEqual([]);
  });
});
