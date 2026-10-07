import { buildFullTSPL, buildTestLabelTSPL, isValidEan13, toCP1251 } from './tspl-builder';
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

  it('requests copies as PRINT 1,<n> on the COM path and PRINT <n>,1 on the spooler', () => {
    const req = CASES.weightedUzAllElements;
    const perLabel = buildFullTSPL(req, { copies: 'perLabel' });
    expect(perLabel).toContain('PRINT 1,3\r\n');
    expect(perLabel).not.toContain('PRINT 3,1');
    expect(buildFullTSPL(req)).toContain('PRINT 3,1\r\n');
  });

  it('builds a test label with the configured size and gap', () => {
    const tspl = buildTestLabelTSPL({ widthMm: 40, heightMm: 30, gapMm: 2, port: 'COM3' });
    expect(tspl).toMatch(/^SIZE 40 mm, 30 mm\r\nGAP 2 mm, 0 mm\r\n/);
    expect(tspl).toContain('"posgro COM3"');
    expect(tspl.endsWith('PRINT 1,1\r\n')).toBe(true);
    expect(tspl.replace(/\r\n/g, '')).not.toMatch(/[\r\n]/);
  });

  it('encodes Cyrillic as cp1251 and Uzbek apostrophes as ASCII', () => {
    expect([...toCP1251('АяЁё')]).toEqual([0xc0, 0xff, 0xa8, 0xb8]);
    expect(toCP1251('oʻgʼ g‘o’').toString('latin1')).toBe("o'g' g'o'");
  });
});
