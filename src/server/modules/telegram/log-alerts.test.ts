import {
  collapse,
  describeReceipts,
  isForwardable,
  LogAlertsService,
  normalizeMessage,
  splitLoggedItems,
  type BufferedLog,
  type ReceiptRef,
  type SaleSummary,
} from './log-alerts.service';
import { msgLogAlert } from './bot-commands';
import type { PrismaService } from '../../prisma/prisma.service';
import type { TelegramService } from './telegram.service';

/**
 * Shaping a terminal's raw log feed into something a shop owner can read.
 *
 * Every string below is a real line sampled from the production `terminal_logs` table, because the
 * whole point of this layer is that the real feed is unsendable: one store writes ~270 info+error
 * lines a day, the info half is per-receipt telemetry, and each fiscal failure logs twice.
 */

const line = (over: Partial<BufferedLog> = {}): BufferedLog => ({
  terminalId: 'T1',
  level: 'error',
  msg: 'x',
  ts: '2026-09-19T10:00:00.000Z',
  ...over,
});

/** The two lines one fiscal failure writes, as the till writes them. */
const rawVcr = (code: number, text: string) =>
  `[fiscal] raw VCR error [${code}] Receipt.Sale: ${text}`;
const staffVcr = (saleId: string, code: number, text: string) =>
  `[fiscal] ✗ fiscalize ${saleId} failed: [${code}] ${text}`;

const timing = (receipt: string, ms: number) =>
  `[fiscal-timing] ${receipt} ok total=${ms}ms queue=0ms config=6ms load=28ms zreport=0ms build=3ms vcr-sale=${ms - 50}`;

describe('which lines reach an admin', () => {
  it('drops warn — the loudest level in production, and not what was asked for', () => {
    expect(isForwardable('warn', '[sync] retrying', false)).toBe(false);
  });

  it('keeps every error', () => {
    expect(isForwardable('error', rawVcr(701003, 'Некорректные входные данные'), false)).toBe(true);
  });

  it('drops the per-receipt timing telemetry, which is most of the info volume', () => {
    expect(isForwardable('info', timing('T1260919040', 3983), false)).toBe(false);
  });

  it('keeps notable info', () => {
    expect(isForwardable('info', '[bootstrap] App started {"version":"1.28.0"}', false)).toBe(true);
    expect(isForwardable('info', '[fiscal] Z-report state warmed at startup: open=false', false)).toBe(true);
  });

  it('gives a verbose subscriber the telemetry as well', () => {
    expect(isForwardable('info', timing('T1260919040', 3983), true)).toBe(true);
  });
});

describe('normalising away the parts that vary per receipt', () => {
  it('erases the sale cuid so repeats group', () => {
    expect(normalizeMessage('[fiscal] ✗ fiscalize cmu7v44wj08sp12d4apjho294 failed'))
      .toBe('[fiscal] ✗ fiscalize <id> failed');
  });

  it('erases the marking code embedded in REGOS wording', () => {
    expect(normalizeMessage('Дубликат кода маркировки (010478011234567890)'))
      .toBe('Дубликат кода маркировки (<code>)');
  });

  it('erases millisecond timings', () => {
    expect(normalizeMessage('total=3983ms vcr-sale=3934ms')).toBe('total=<t> vcr-sale=<t>');
  });

  // Without this, two unrelated failures would be reported as one repeated failure.
  it('leaves error codes alone, so different codes stay different', () => {
    expect(normalizeMessage('failed [701003] x')).not.toBe(normalizeMessage('failed [704030] x'));
  });
});

describe('collapsing a window into incidents', () => {
  it('folds the raw and staff-facing line of one failure into a single entry', () => {
    const groups = collapse(
      [
        line({ msg: rawVcr(701003, 'Некорректные входные данные (Код обязательной маркировки не задан)') }),
        line({ msg: staffVcr('cmq0fj8a5036igceilsry79jn', 701003, 'Не отсканирован код маркировки (Asl-Belgisi)') }),
      ],
      false,
    );
    expect(groups).toHaveLength(1);
    // The staff wording is the one written for a human, so that is the one shown.
    expect(groups[0].text).toBe('[701003] Не отсканирован код маркировки (Asl-Belgisi)');
  });

  // Each failure writes two lines; counting lines would report every number twice.
  it('counts receipts, not log lines', () => {
    const entries: BufferedLog[] = [];
    for (const id of ['cmq0fj8a5036igceilsry79jn', 'cmq0fgvcc033pgceid4y3imw0', 'cmq0fbyu30334gcei4wx26wka']) {
      entries.push(line({ msg: rawVcr(701003, 'Код обязательной маркировки не задан') }));
      entries.push(line({ msg: staffVcr(id, 701003, 'Не отсканирован код маркировки (Asl-Belgisi)') }));
    }
    const groups = collapse(entries, false);
    expect(groups).toHaveLength(1);
    expect(groups[0].count).toBe(3);
  });

  it('keeps different REGOS codes apart', () => {
    const groups = collapse(
      [
        line({ msg: staffVcr('s1', 701003, 'Не отсканирован код маркировки') }),
        line({ msg: staffVcr('s2', 704030, 'Код маркировки недействителен') }),
        line({ msg: staffVcr('s3', 703000, 'Неверный формат запроса') }),
      ],
      false,
    );
    expect(groups.map((g) => g.text)).toEqual([
      '[701003] Не отсканирован код маркировки',
      '[704030] Код маркировки недействителен',
      '[703000] Неверный формат запроса',
    ]);
  });

  it('groups a repeated non-fiscal message and records every terminal it hit', () => {
    const groups = collapse(
      [
        line({ terminalId: 'T2', msg: '[sync] upload failed: ETIMEDOUT' }),
        line({ terminalId: 'T1', msg: '[sync] upload failed: ETIMEDOUT' }),
      ],
      false,
    );
    expect(groups).toHaveLength(1);
    expect(groups[0].count).toBe(2);
    expect(groups[0].terminals).toEqual(['T1', 'T2']);
  });

  it('puts errors above info', () => {
    const groups = collapse(
      [
        line({ level: 'info', msg: '[bootstrap] App started' }),
        line({ level: 'error', msg: '[fiscal] printer offline' }),
      ],
      false,
    );
    expect(groups.map((g) => g.level)).toEqual(['error', 'info']);
  });

  it('is empty when a window held nothing but telemetry', () => {
    expect(collapse([line({ level: 'info', msg: timing('T1260919040', 3983) })], false)).toEqual([]);
  });

  it('but not for a verbose subscriber', () => {
    expect(collapse([line({ level: 'info', msg: timing('T1260919040', 3983) })], true)).toHaveLength(1);
  });
});

describe('the message an admin receives', () => {
  const groups = collapse(
    [
      line({ msg: rawVcr(701003, 'Некорректные входные данные') }),
      line({ msg: staffVcr('s1', 701003, 'Не отсканирован код маркировки (Asl-Belgisi)') }),
      line({ msg: staffVcr('s2', 701003, 'Не отсканирован код маркировки (Asl-Belgisi)') }),
      line({ level: 'info', msg: '[bootstrap] App started {"version":"1.28.0"}' }),
    ],
    false,
  );

  it('shows the repeat count and both levels', () => {
    const html = msgLogAlert({ terminals: ['T1'], shown: groups, hidden: 0 }, 'ru');
    expect(html).toContain('×2');
    expect(html).toContain('Не отсканирован код маркировки');
    expect(html).toContain('App started');
  });

  // A log line may contain anything; Markdown would reject the whole message over a stray bracket.
  it('escapes HTML so a hostile log line cannot break the message', () => {
    const html = msgLogAlert(
      { terminals: ['T1'], shown: [{ level: 'error', text: '<b>x</b> & y', count: 1, terminals: ['T1'] }], hidden: 0 },
      'ru',
    );
    expect(html).toContain('&lt;b&gt;x&lt;/b&gt; &amp; y');
    expect(html).not.toContain('<b>x</b>');
  });

  it('reports the overflow rather than sending an unreadable wall', () => {
    const html = msgLogAlert({ terminals: ['T1'], shown: groups, hidden: 7 }, 'ru');
    expect(html).toContain('7');
    expect(html).toContain('ещё');
  });

  // Telegram rejects anything over 4096 characters, so a burst of long lines must not be sent whole.
  it('stays inside Telegram’s message limit, dropping whole lines and saying how many', () => {
    const long = Array.from({ length: 20 }, (_, i) => ({
      level: 'error' as const,
      text: `[70100${i % 10}] ${'очень длинная строка ошибки '.repeat(8)}`,
      count: 1,
      terminals: ['T1'],
    }));
    const html = msgLogAlert({ terminals: ['T1'], shown: long, hidden: 3 }, 'ru');
    expect(html.length).toBeLessThanOrEqual(4096);
    expect(html).toMatch(/…и ещё \d+/);
  });

  // A super-admin's chat is subscribed to every store at once, so the store has to be on the message.
  it('names the store only when the subscriber follows more than one', () => {
    expect(msgLogAlert({ terminals: ['T1'], shown: groups, hidden: 0, storeId: '1234' }, 'ru'))
      .toContain('1234');
    expect(msgLogAlert({ terminals: ['T1'], shown: groups, hidden: 0, storeId: null }, 'ru'))
      .not.toContain('Магазин');
  });

  it('speaks Uzbek to an Uzbek chat', () => {
    const html = msgLogAlert({ terminals: ['T1'], shown: groups, hidden: 0 }, 'uz');
    expect(html).toContain('Terminal jurnali');
    expect(html).not.toContain('Журнал терминала');
  });
});

describe('naming the receipts a fiscal failure hit', () => {
  const ref = (saleId: string, ts: string): ReceiptRef => ({ saleId, ts, products: [], moreProducts: 0 });
  const sale =(over: Partial<SaleSummary> = {}): SaleSummary => ({
    receiptNumber: 'T1261005042',
    createdAt: new Date('2026-10-05T09:32:00.000Z'),
    products: ['Coca-Cola 1L', 'Pepsi 0.5L'],
    itemCount: 2,
    ...over,
  });

  it('records each failed sale once, in order, with when it was logged', () => {
    const [group] = collapse(
      [
        line({ msg: rawVcr(701003, 'x') }),
        line({ msg: staffVcr('saleA', 701003, 'Не отсканирован код'), ts: '2026-10-05T09:00:00.000Z' }),
        line({ msg: staffVcr('saleB', 701003, 'Не отсканирован код'), ts: '2026-10-05T09:01:00.000Z' }),
        line({ msg: staffVcr('saleA', 701003, 'Не отсканирован код'), ts: '2026-10-05T09:02:00.000Z' }),
      ],
      false,
    );
    expect(group.receiptRefs).toEqual([
      { saleId: 'saleA', ts: '2026-10-05T09:00:00.000Z', products: [], moreProducts: 0 },
      { saleId: 'saleB', ts: '2026-10-05T09:01:00.000Z', products: [], moreProducts: 0 },
    ]);
  });

  it('has no receipts for a line that names none', () => {
    expect(collapse([line({ msg: '[sync] upload failed' })], false)[0].receiptRefs).toEqual([]);
  });

  // Tills from 1.32.17 append the receipt's products to the failure line.
  it('reads the products a newer till appends, and keeps them out of the incident text', () => {
    const [group] = collapse(
      [
        line({ msg: staffVcr('saleA', 701003, 'Не отсканирован код items=["Сок, яблоко [1L]","Pepsi"]') }),
        line({ msg: staffVcr('saleB', 701003, 'Не отсканирован код items=["A","B","C"] +4') }),
      ],
      false,
    );
    expect(group.text).toBe('[701003] Не отсканирован код');
    expect(group.receiptRefs.map((r) => [r.products, r.moreProducts])).toEqual([
      [['Сок, яблоко [1L]', 'Pepsi'], 0],
      [['A', 'B', 'C'], 4],
    ]);
  });

  it('leaves a suffix that does not parse in the text rather than dropping it', () => {
    expect(splitLoggedItems('Ошибка items=[not json]')).toEqual({
      text: 'Ошибка items=[not json]',
      products: [],
      moreProducts: 0,
    });
  });

  it('takes number, time and products from the synced sale, and counts the rest', () => {
    const { shown, hidden } = describeReceipts(
      [ref('a', '2026-10-05T09:33:00.000Z')],
      new Map([['a', sale({ products: ['A', 'B', 'C'], itemCount: 5 })]]),
    );
    expect(hidden).toBe(0);
    expect(shown[0]).toEqual({
      at: new Date('2026-10-05T09:32:00.000Z'),
      receiptNumber: 'T1261005042',
      products: ['A', 'B', 'C'],
      moreProducts: 2,
    });
  });

  // The till fiscalizes before the sale syncs, so the server may not have it yet.
  it('falls back to the log time for a sale the server has not got', () => {
    const { shown } = describeReceipts([ref('a', '2026-10-05T09:33:00.000Z')], new Map());
    expect(shown[0]).toEqual({ at: '2026-10-05T09:33:00.000Z', receiptNumber: null, products: [], moreProducts: 0 });
  });

  it('and to the products the log line named', () => {
    const { shown } = describeReceipts(
      [{ ...ref('a', '2026-10-05T09:33:00.000Z'), products: ['A', 'B', 'C'], moreProducts: 4 }],
      new Map(),
    );
    expect(shown[0]).toMatchObject({ receiptNumber: null, products: ['A', 'B', 'C'], moreProducts: 4 });
  });

  it('names at most three receipts and counts the rest', () => {
    const refs = ['a', 'b', 'c', 'd', 'e'].map((saleId) => ref(saleId, '2026-10-05T09:00:00.000Z'));
    const { shown, hidden } = describeReceipts(refs, new Map());
    expect(shown).toHaveLength(3);
    expect(hidden).toBe(2);
  });

  it('shows them under the incident, in shop time, escaped', () => {
    const html = msgLogAlert(
      {
        terminals: ['T1'],
        hidden: 0,
        shown: [
          {
            level: 'error',
            text: '[701003] Не отсканирован код',
            count: 2,
            terminals: ['T1'],
            receipts: [
              {
                at: new Date('2026-10-05T09:32:00.000Z'),
                receiptNumber: 'T1261005042',
                products: ['Сок <Rich> 1L'],
                moreProducts: 2,
              },
              { at: '2026-10-05T09:40:00.000Z', receiptNumber: null, products: [], moreProducts: 0 },
            ],
            hiddenReceipts: 4,
          },
        ],
      },
      'ru',
    );
    // 09:32 UTC is 14:32 in Tashkent.
    expect(html).toContain('🧾 05.10, 14:32 · №T1261005042 · Сок &lt;Rich&gt; 1L +2');
    expect(html).toContain('🧾 05.10, 14:40 · чек ещё не синхронизирован');
    expect(html).toContain('…и ещё 4 чек(ов)');
  });
});

describe('looking up the failed sales', () => {
  const telegram = {} as TelegramService;

  it('asks only within the store and maps what it finds', async () => {
    const findMany = jest.fn().mockResolvedValue([
      {
        id: 'a',
        receiptNumber: 'T1261005042',
        createdAt: new Date('2026-10-05T09:32:00.000Z'),
        items: [{ productName: 'Coca-Cola 1L' }],
        _count: { items: 4 },
      },
    ]);
    const service = new LogAlertsService({ sale: { findMany } } as unknown as PrismaService, telegram);

    const sales = await service.loadSales('store-1', ['a', 'b']);

    expect(findMany.mock.calls[0][0].where).toEqual({ storeId: 'store-1', id: { in: ['a', 'b'] } });
    expect(sales.get('a')).toEqual({
      receiptNumber: 'T1261005042',
      createdAt: new Date('2026-10-05T09:32:00.000Z'),
      products: ['Coca-Cola 1L'],
      itemCount: 4,
    });
    expect(sales.has('b')).toBe(false);
  });

  it('skips the query when no sale was named', async () => {
    const findMany = jest.fn();
    const service = new LogAlertsService({ sale: { findMany } } as unknown as PrismaService, telegram);
    expect((await service.loadSales('store-1', [])).size).toBe(0);
    expect(findMany).not.toHaveBeenCalled();
  });

  // The details are a convenience; the alert itself must still go out.
  it('returns nothing rather than throwing when the lookup fails', async () => {
    const findMany = jest.fn().mockRejectedValue(new Error('db down'));
    const service = new LogAlertsService({ sale: { findMany } } as unknown as PrismaService, telegram);
    expect((await service.loadSales('store-1', ['a'])).size).toBe(0);
  });
});
