// The till's fiscal wording is imported straight from its source, so a sentence added there without
// an Uzbek counterpart here fails this suite. That module loads the till logger (electron-log),
// which has no place in a server test.
jest.mock('../../../main/logger', () => ({
  log: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { VCR_ERROR_HINTS, describeVcrError } from '../../../main/fiscal/regos-vcr-client';
import { effectiveLang, uzOnlyRole } from './bot-commands';
import { COVERED, toUzbekLogText } from './log-uz';

describe('effectiveLang', () => {
  it('writes to store admins and cashiers in Uzbek when the flag is on, whatever they chose', () => {
    expect(effectiveLang('ADMIN', 'ru', true)).toBe('uz');
    expect(effectiveLang('USER', 'ru', true)).toBe('uz');
    expect(effectiveLang('USER', null, true)).toBe('uz');
  });

  it('lets the super admin and suppliers keep their choice', () => {
    expect(effectiveLang('SUPER_ADMIN', 'ru', true)).toBe('ru');
    expect(effectiveLang('SUPPLIER', 'ru', true)).toBe('ru');
    expect(effectiveLang('SUPPLIER', 'uz', true)).toBe('uz');
  });

  it('changes nothing when the flag is off', () => {
    expect(effectiveLang('ADMIN', 'ru', false)).toBe('ru');
    expect(effectiveLang('ADMIN', 'uz', false)).toBe('uz');
    expect(effectiveLang('ADMIN', null, false)).toBe('ru'); // the old default
  });

  it('asks only the roles that keep a choice', () => {
    expect(['ADMIN', 'USER', 'SUPER_ADMIN', 'SUPPLIER'].filter(uzOnlyRole)).toEqual([
      'ADMIN',
      'USER',
    ]);
  });
});

describe('toUzbekLogText', () => {
  it('translates a staff sentence, keeping the REGOS code', () => {
    expect(toUzbekLogText('[701003] Не отсканирован код маркировки (Asl-Belgisi)')).toBe(
      '[701003] Markirovka kodi skanerlanmagan (Asl-Belgisi)',
    );
  });

  it('falls back to the code when the wording is REGOS\x27s own description', () => {
    expect(toUzbekLogText('[704010] Z-report is not opened')).toBe(
      '[704010] Z-hisobot ochilmagan — smenani oching',
    );
  });

  it('names an unknown code in Uzbek when the till had no description for it', () => {
    expect(toUzbekLogText('[709999] Ошибка ВКМ (709999)')).toBe(
      '[709999] Virtual kassa xatosi (709999)',
    );
  });

  it('leaves an unknown fiscal description and every non-fiscal line as written', () => {
    expect(toUzbekLogText('[709999] Что-то новое')).toBe('[709999] Что-то новое');
    expect(toUzbekLogText('[sync] uploaded 12 sales')).toBe('[sync] uploaded 12 sales');
  });
});

describe('every fiscal sentence a till can log has Uzbek', () => {
  it('covers every code in VCR_ERROR_HINTS', () => {
    const missing = Object.keys(VCR_ERROR_HINTS)
      .map(Number)
      .filter((code) => !COVERED.codes.includes(code));
    expect(missing).toEqual([]);
  });

  it('covers every sentence describeVcrError builds from a REGOS description', () => {
    // One REGOS description per pattern-based branch of describeVcrError, plus the code-only ones.
    const produced = [
      describeVcrError(701003, 'Код обязательной маркировки не задан'),
      describeVcrError(701003, 'Код маркировки недействителен'),
      describeVcrError(701003, 'Содержит не разрешённые символы'),
      describeVcrError(701003, 'Ошибка маркировки'),
      describeVcrError(701003, 'Ставка НДС запрещена'),
      describeVcrError(705511, 'ИКПУ не найден'),
      describeVcrError(704020, ''),
      describeVcrError(0, ''),
    ];
    const untranslated = produced.filter((s) => toUzbekLogText(`[1] ${s}`) === `[1] ${s}`);
    expect(untranslated).toEqual([]);
  });
});
