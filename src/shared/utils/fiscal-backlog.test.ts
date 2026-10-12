import {
  SKIP_TAG,
  isBacklogCandidate,
  isCashOrClickOnly,
  maySkipFiscalisation,
  SKIP_TAG_MARKING,
  parseLinePlan,
  backlogTender,
  planCashBatches,
  isMergedBatchId,
  parseMergeSize,
  backlogSums,
  NO_BATCH,
  type BacklogSaleShape,
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
    ['DISABLED', SKIP_TAG_MARKING, false],
    ['FISCALIZED', null, false],
    ['DEFERRED_DEBT', null, false],
  ])('%s / %s → %s', (status, error, expected) => {
    expect(isBacklogCandidate(status, error)).toBe(expected);
  });
});

describe('parseLinePlan', () => {
  it('reads valid rows and ignores junk', () => {
    expect(
      parseLinePlan(
        '[{"itemId":"i1","action":"omit","reason":"UNMARKED"},{"itemId":"i2","action":"x"},{"barcode":"1"},null]',
      ),
    ).toEqual([{ itemId: 'i1', action: 'omit', reason: 'UNMARKED' }]);
    expect(parseLinePlan('not json')).toEqual([]);
    expect(parseLinePlan(null)).toEqual([]);
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

describe('merging old cash receipts', () => {
  const at = (day: number, hour = 12) => new Date(2026, 9, day, hour);
  const cand = (id: string, createdAt: Date, lines = 1, batchId: string | null = null) => ({
    id,
    createdAt,
    lines,
    batchId,
  });
  let seq = 0;
  const newId = () => `b${++seq}`;
  beforeEach(() => {
    seq = 0;
  });

  it.each([
    [{ paymentMethod: 'cash' }, 'CASH'],
    [{ paymentMethod: 'click' }, 'CASH'],
    [{ paymentMethod: 'mixed', payments: [{ method: 'cash' }, { method: 'click' }] }, 'CASH'],
    [{ paymentMethod: 'card' }, 'CARD'],
    [{ paymentMethod: 'mixed', payments: [{ method: 'cash' }, { method: 'card' }] }, 'CARD'],
    [{ paymentMethod: 'cash', debtAmount: 500 }, 'CARD'],
    [{ paymentMethod: 'uzqr' }, 'UZQR'],
  ] as Array<[BacklogSaleShape, string]>)('%j sorts into %s', (shape, tender) => {
    expect(backlogTender(shape)).toBe(tender);
  });

  it('cuts 250 receipts of one day into 100 + 100 + 50, oldest first', () => {
    const cands = Array.from({ length: 250 }, (_, i) =>
      cand(`s${i}`, new Date(2026, 9, 2, 8, 0, i)),
    );
    const plan = planCashBatches(cands.slice().reverse(), 100, newId);
    expect(plan.size).toBe(250);
    expect(plan.get('s0')).toBe('batch:b1');
    expect(plan.get('s99')).toBe('batch:b1');
    expect(plan.get('s100')).toBe('batch:b2');
    expect(plan.get('s249')).toBe('batch:b3');
  });

  it('never puts two calendar days in one batch', () => {
    const plan = planCashBatches(
      [cand('a', at(2, 9)), cand('b', at(2, 20)), cand('c', at(3, 9)), cand('d', at(3, 10))],
      100,
      newId,
    );
    expect(plan.get('a')).toBe(plan.get('b'));
    expect(plan.get('c')).toBe(plan.get('d'));
    expect(plan.get('a')).not.toBe(plan.get('c'));
  });

  it('cuts a batch early at the line cap', () => {
    const plan = planCashBatches(
      [cand('a', at(2, 9), 300), cand('b', at(2, 10), 300), cand('c', at(2, 11), 100)],
      100,
      newId,
    );
    // a alone would be a batch of one → stays single; b + c fit under 500.
    expect(plan.has('a')).toBe(false);
    expect(plan.get('b')).toBe(plan.get('c'));
  });

  it('leaves a lone receipt unbatched and never touches an assigned one', () => {
    const plan = planCashBatches(
      [
        cand('alone', at(5)),
        cand('done', at(6), 1, 'batch:old'),
        cand('fallback', at(6), 1, NO_BATCH),
        cand('x', at(6)),
      ],
      100,
      newId,
    );
    expect(plan.size).toBe(0);
  });

  it('isMergedBatchId tells a batch from the fallback marker', () => {
    expect(isMergedBatchId('batch:1')).toBe(true);
    expect(isMergedBatchId(NO_BATCH)).toBe(false);
    expect(isMergedBatchId(null)).toBe(false);
  });

  it.each([
    [undefined, 100],
    ['', 100],
    ['50', 50],
    ['1', 100],
    ['2.5', 100],
    ['5000', 100],
  ])('merge size %p → %p', (raw, n) => {
    expect(parseMergeSize(raw)).toBe(n);
  });

  it('sums fiscalised / total in tiyin, sent amount first, skips out of the total', () => {
    expect(
      backlogSums([
        { finalAmount: 10_000, fiscalStatus: 'FISCALIZED', fiscalError: null, fiscalSentTiyin: 400_000 },
        { finalAmount: 2_500.5, fiscalStatus: 'FISCALIZED', fiscalError: null, fiscalSentTiyin: null },
        { finalAmount: 3_000, fiscalStatus: 'FAILED', fiscalError: 'x' },
        { finalAmount: 7_000, fiscalStatus: 'DISABLED', fiscalError: SKIP_TAG },
        { finalAmount: 8_000, fiscalStatus: 'DISABLED', fiscalError: SKIP_TAG_MARKING },
        { finalAmount: 9_000, fiscalStatus: 'DEFERRED_DEBT', fiscalError: null },
        { finalAmount: 1_000, fiscalStatus: null, fiscalError: null },
      ]),
    ).toEqual({ totalTiyin: 1_000_000 + 250_050 + 300_000 + 100_000, fiscalizedTiyin: 400_000 + 250_050 });
  });
});
