import { buildFullTSPL, isValidEan13, toCP1251 } from './tspl-builder';
import { CASES } from './__fixtures__/tspl-cases';
import spooler from './__fixtures__/tspl-spooler.json';

describe('tspl-builder', () => {
  describe('spooler output did not change when the builder moved', () => {
    it.each(Object.keys(CASES))('%s', (name) => {
      const bytes = toCP1251(buildFullTSPL(CASES[name])).toString('hex');
      expect(bytes).toBe((spooler as Record<string, string>)[name]);
    });
  });

  it('ends every line with CRLF and never a bare LF', () => {
    const tspl = buildFullTSPL(CASES.weightedUzAllElements);
    expect(tspl.endsWith('\r\n')).toBe(true);
    expect(tspl.replace(/\r\n/g, '')).not.toMatch(/[\r\n]/);
  });

  it('chooses EAN13 only for a valid check digit, Code128 otherwise', () => {
    expect(isValidEan13('4780047860466')).toBe(true);
    expect(isValidEan13('4780047860467')).toBe(false);
    expect(buildFullTSPL(CASES.defaultRu)).toContain('"EAN13"');
    const invalid = buildFullTSPL(CASES.weightedUzAllElements);
    expect(invalid).toContain('"128"');
    expect(invalid).not.toContain('"EAN13"');
  });

  it('encodes Cyrillic as cp1251 and Uzbek apostrophes as ASCII', () => {
    expect([...toCP1251('АяЁё')]).toEqual([0xc0, 0xff, 0xa8, 0xb8]);
    expect(toCP1251('oʻgʼ g‘o’').toString('latin1')).toBe("o'g' g'o'");
  });
});
