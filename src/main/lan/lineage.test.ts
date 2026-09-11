import { judgeMain } from './lineage';

const L = 'lineage-a';

describe('judgeMain', () => {
  it('accepts the main it knows, at the generation it knows', () => {
    expect(judgeMain({ lineage: L, generation: 2 }, { lineage: L, generation: 2 })).toBe('accept');
  });

  // §11.3's reason to exist: the replaced main comes back from repair still believing it is main.
  it('refuses an older main of its own lineage', () => {
    expect(judgeMain({ lineage: L, generation: 2 }, { lineage: L, generation: 1 })).toBe('superseded');
  });

  it('records a promotion further along its lineage', () => {
    expect(judgeMain({ lineage: L, generation: 2 }, { lineage: L, generation: 3 })).toBe('record');
  });

  it("refuses a main of a different lineage — not the one it is paired with", () => {
    expect(judgeMain({ lineage: L, generation: 0 }, { lineage: 'other', generation: 9 })).toBe(
      'superseded',
    );
  });

  // Nothing to compare yet: a till paired before the guard existed adopts what it is shown.
  it('adopts the lineage of its main when it has none of its own', () => {
    expect(judgeMain({ lineage: null, generation: 0 }, { lineage: L, generation: 4 })).toBe('record');
  });

  // A main on an older build says nothing; refusing it would strand a shop mid-upgrade.
  it('accepts a main too old to state a lineage', () => {
    expect(judgeMain({ lineage: L, generation: 2 }, { lineage: null, generation: 0 })).toBe('accept');
  });

  it('accepts when neither side has a lineage', () => {
    expect(judgeMain({ lineage: null, generation: 0 }, { lineage: null, generation: 0 })).toBe('accept');
  });
});
