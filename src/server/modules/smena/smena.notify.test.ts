import { SmenaService } from './smena.service';
import { msgShiftClosed, msgShiftOpened } from '../telegram/bot-commands';
import type { SyncSmenaDto } from './dto/sync-smena.dto';

/**
 * Shift notifications: the message an admin reads, and the rule that they read it once.
 *
 * The once-only rule is the part with teeth. A terminal re-sends a shift until the server
 * confirms it, and the upsert is idempotent by design, so notifying on every upsert would send
 * the same end-of-day report on every retry — and the terminal retries a shift it synced while
 * offline for as long as it takes to get through.
 */

/**
 * ru-RU groups thousands with a non-breaking space (U+00A0), so '150 000' typed here would never
 * match. Normalised rather than pasted invisibly into the expectations, where the next reader
 * would retype it as a plain space and be told the code is broken.
 */
const plain = (s: string) => s.replace(/\u00A0/g, ' ');

const shift = (over: Partial<SyncSmenaDto> = {}): SyncSmenaDto =>
  ({
    id: 'smena-1',
    terminalId: 'T1',
    cashierId: 'u1',
    cashierName: 'Иван Иванов',
    initialCash: '100000',
    finalCash: '250000',
    zReportNumber: 42,
    cashSalesAmount: '150000',
    cardSalesAmount: '80000',
    payInTotal: '0',
    payOutTotal: '0',
    returnAmount: '0',
    openedAt: '2026-09-20T08:00:00.000Z',
    closedAt: '2026-09-20T20:00:00.000Z',
    movements: [],
    ...over,
  }) as SyncSmenaDto;

function build(existingShift: { id: string } | null) {
  const prisma = {
    smena: {
      findUnique: jest.fn(async () => existingShift),
      upsert: jest.fn(),
    },
    smenaMovement: { deleteMany: jest.fn(), createMany: jest.fn() },
    user: { findUnique: jest.fn(async () => null) },
    $transaction: jest.fn(async () => undefined),
  };
  const telegram = { notifyStoreAdmins: jest.fn(async () => undefined) };
  return {
    service: new SmenaService(prisma as never, telegram as never),
    prisma,
    telegram,
  };
}

/** The html the fan-out would have sent, by rendering its callback the way a chat would. */
const rendered = (telegram: ReturnType<typeof build>['telegram']) => {
  const call = telegram.notifyStoreAdmins.mock.calls[0] as unknown as [
    string,
    (lang: 'ru' | 'uz') => string,
  ];
  return { storeId: call[0], html: call[1]('ru') };
};

describe('closing notification', () => {
  it('reports a shift the first time it arrives', async () => {
    const { service, telegram } = build(null);
    await service.syncFromTerminal('store-1', [shift()]);

    expect(telegram.notifyStoreAdmins).toHaveBeenCalledTimes(1);
    const { storeId, html } = rendered(telegram);
    expect(storeId).toBe('store-1');
    expect(plain(html)).toContain('Смена закрыта');
    expect(plain(html)).toContain('Иван Иванов');
  });

  it('stays quiet when the same shift is synced again', async () => {
    // The terminal's retry path: same id, already known here.
    const { service, telegram } = build({ id: 'smena-1' });
    await service.syncFromTerminal('store-1', [shift()]);

    expect(telegram.notifyStoreAdmins).not.toHaveBeenCalled();
  });

  it('does not fail the sync when the shift cannot be reported', async () => {
    // The terminal marks a shift synced off this response. Telegram being down must not cost it.
    const { service, telegram } = build(null);
    telegram.notifyStoreAdmins.mockRejectedValueOnce(new Error('telegram is down'));

    await expect(service.syncFromTerminal('store-1', [shift()])).resolves.toEqual({
      synced: 1,
      skipped: 0,
    });
  });
});

describe('the closing message', () => {
  const closed = {
    terminalId: 'T1',
    cashierName: 'Иван Иванов',
    initialCash: 100_000,
    finalCash: 250_000,
    openedAt: '2026-09-20T08:00:00.000Z',
    closedAt: '2026-09-20T20:00:00.000Z',
    zReportNumber: 42,
    cashSalesAmount: 150_000,
    cardSalesAmount: 80_000,
    payInTotal: 0,
    payOutTotal: 0,
    returnAmount: 0,
  };

  it('balances when the drawer holds what the shift earned', () => {
    // 100 000 + 150 000 cash sales = 250 000 counted.
    const html = msgShiftClosed(closed, 'ru');
    expect(plain(html)).toContain('✅');
    expect(plain(html)).toContain('Расхождение: <b>0</b>');
  });

  it('signs a shortage so it cannot be misread as a balanced drawer', () => {
    const html = msgShiftClosed({ ...closed, finalCash: 238_000 }, 'ru');
    expect(plain(html)).toContain('🔴');
    expect(plain(html)).toContain('Расхождение: <b>-12 000</b>');
  });

  it('marks a surplus with its own sign and colour', () => {
    const html = msgShiftClosed({ ...closed, finalCash: 255_000 }, 'ru');
    expect(plain(html)).toContain('🔵');
    expect(plain(html)).toContain('Расхождение: <b>+5 000</b>');
  });

  it('counts pay-ins, pay-outs and returns into what was expected', () => {
    const html = msgShiftClosed(
      { ...closed, payInTotal: 20_000, payOutTotal: 50_000, returnAmount: 10_000, finalCash: 0 },
      'ru',
    );
    // 100 000 + 150 000 + 20 000 − 50 000 − 10 000
    expect(plain(html)).toContain('Ожидалось: <b>210 000</b>');
  });

  it('escapes a cashier name so one stray bracket cannot break the message', () => {
    // Telegram rejects malformed HTML outright rather than sending it plain.
    const html = msgShiftClosed({ ...closed, cashierName: 'Иван <b>' }, 'ru');
    expect(plain(html)).toContain('Иван &lt;b&gt;');
  });

  it('speaks Uzbek to an Uzbek chat', () => {
    expect(msgShiftClosed(closed, 'uz')).toContain('Smena yopildi');
  });
});

describe('the opening message', () => {
  it('says who opened the till, when, and with how much', () => {
    const html = msgShiftOpened(
      {
        terminalId: 'T1',
        cashierName: 'Иван Иванов',
        initialCash: 150_000,
        openedAt: '2026-09-20T08:00:00.000Z',
        zReportNumber: 42,
      },
      'ru',
    );
    expect(plain(html)).toContain('Смена открыта');
    expect(plain(html)).toContain('Иван Иванов');
    expect(plain(html)).toContain('150 000');
    expect(plain(html)).toContain('№42');
  });
});
