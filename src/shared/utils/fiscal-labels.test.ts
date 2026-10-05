import { labelsPerLine } from './fiscal-labels';

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
