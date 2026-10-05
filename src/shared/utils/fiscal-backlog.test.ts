import {
  SKIP_TAG,
  isBacklogCandidate,
  isCashOrClickOnly,
  maySkipFiscalisation,
  parseSubstitutions,
} from './fiscal-backlog';
import { repairCyrillicLayout } from './keyboard-layout';

describe('rule #1 — what may skip fiscalisation', () => {
  it.each([
    ['cash', true],
    ['click', true],
    ['CASH', true],
    ['card', false],
    ['uzqr', false],
    ['debt', false],
  ])('single tender %s → cash/Click only = %s', (method, expected) => {
    expect(isCashOrClickOnly({ paymentMethod: method })).toBe(expected);
  });

  it('mixed cash + Click may skip', () => {
    expect(
      isCashOrClickOnly({
        paymentMethod: 'mixed',
        payments: [{ method: 'cash' }, { method: 'click' }],
      }),
    ).toBe(true);
  });

  it('mixed cash + card must be fiscalised', () => {
    expect(
      isCashOrClickOnly({
        paymentMethod: 'mixed',
        payments: [{ method: 'cash' }, { method: 'card' }],
      }),
    ).toBe(false);
  });

  it('mixed without its lines must be fiscalised', () => {
    expect(isCashOrClickOnly({ paymentMethod: 'mixed', payments: [] })).toBe(false);
  });

  it('a cash sale with an open debt part must be fiscalised', () => {
    expect(isCashOrClickOnly({ paymentMethod: 'cash', debtAmount: '15000' })).toBe(false);
  });

  it('a marked product always forces fiscalisation, even for cash', () => {
    expect(maySkipFiscalisation({ paymentMethod: 'cash' }, true)).toBe(false);
    expect(maySkipFiscalisation({ paymentMethod: 'cash' }, false)).toBe(true);
    expect(maySkipFiscalisation({ paymentMethod: 'card' }, false)).toBe(false);
  });
});

describe('backlog candidates', () => {
  it.each([
    ['PENDING', null, true],
    ['FAILED', 'x', true],
    [null, null, true],
    ['DISABLED', null, true],
    ['DISABLED', 'out_of_circulation:OUT', true],
    ['DISABLED', SKIP_TAG, false],
    ['FISCALIZED', null, false],
    ['DEFERRED_DEBT', null, false],
  ])('%s / %s → %s', (status, error, expected) => {
    expect(isBacklogCandidate(status, error)).toBe(expected);
  });
});

describe('parseSubstitutions', () => {
  it('reads valid rows and ignores junk', () => {
    expect(parseSubstitutions('[{"barcode":"1","reason":"NO_LABEL"},{"x":1},null]')).toEqual([
      { barcode: '1', reason: 'NO_LABEL' },
    ]);
    expect(parseSubstitutions('not json')).toEqual([]);
    expect(parseSubstitutions(null)).toEqual([]);
  });
});

describe('marking code captured under a Russian layout', () => {
  it('restores the owner-reported code exactly', () => {
    const ru =
      '010869954300836321ФК1600001402291ГЯА092Й2Ьцв50птЯФшоОЯвнсНСимдаьф9шНлПМ3ДВ6я71ЗЬТН=';
    const en =
      '010869954300836321AR1600001402291UZF092Q2Mwd50gnZAijJZdycYCbvlfma9iYkGV3LD6z71PMNY=';
    expect(repairCyrillicLayout(ru)).toBe(en);
  });
});
