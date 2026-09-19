import { BadRequestException } from '@nestjs/common';
import { LogsService } from './logs.service';

/**
 * Filtering terminal logs by REGOS:VCR error number. A till writes one line per fiscal failure
 * with the raw code in it (src/main/fiscal/regos-vcr-service.ts) — the filter has to find exactly
 * the lines for one code, and no others.
 */

/** The line a till writes, as regos-vcr-service.ts formats it. */
const rawLine = (code: number, method: string, description: string) =>
  `[fiscal] raw VCR error [${code}] ${method}: ${description}`;

function build(vcrRows: unknown[] = []) {
  const prisma = {
    terminalLog: {
      count: jest.fn(async () => 0),
      findMany: jest.fn(async () => []),
    },
    $queryRaw: jest.fn(async () => vcrRows),
  };
  // The alert fan-out is exercised in log-alerts.test.ts; here it only has to be inert.
  const logAlerts = { enqueue: jest.fn() };
  return { service: new LogsService(prisma as never, logAlerts as never), prisma, logAlerts };
}

/** The `where` the listing query ran with. */
const whereOf = (prisma: ReturnType<typeof build>['prisma']) =>
  (prisma.terminalLog.findMany.mock.calls[0] as unknown as [{ where: Record<string, unknown> }])[0].where;

describe('filtering logs by VCR error number', () => {
  it('finds the lines for one code', async () => {
    const { service, prisma } = build();
    await service.getLogs('SUPER_ADMIN', null, { vcrCode: '701003' });
    const needle = (whereOf(prisma).message as { contains: string }).contains;
    expect(rawLine(701003, 'Receipt.Sale', 'Ставка НДС запрещена')).toContain(needle);
    // Not another code, and not the staff-facing line for the same failure.
    expect(rawLine(703000, 'Receipt.Sale', 'Неверный формат')).not.toContain(needle);
    expect('[fiscal] ✗ fiscalize s1 failed: Некорректные данные чека').not.toContain(needle);
  });

  // The bracket closes the code, so it is not a prefix search: 701003 must not catch a longer code.
  it('matches the whole code only', async () => {
    const { service, prisma } = build();
    await service.getLogs('SUPER_ADMIN', null, { vcrCode: '701003' });
    const needle = (whereOf(prisma).message as { contains: string }).contains;
    expect(rawLine(701003, 'Receipt.Sale', 'x')).toContain(needle);
    expect(rawLine(7010031, 'Receipt.Sale', 'x')).not.toContain(needle);
  });

  it('finds "VCR unreachable", which the till logs as code 0', async () => {
    const { service, prisma } = build();
    await service.getLogs('SUPER_ADMIN', null, { vcrCode: '0' });
    const needle = (whereOf(prisma).message as { contains: string }).contains;
    expect(rawLine(0, 'ZReport.GetInfo', 'fetch failed')).toContain(needle);
  });

  it("'any' finds every VCR error", async () => {
    const { service, prisma } = build();
    await service.getLogs('SUPER_ADMIN', null, { vcrCode: 'any' });
    const needle = (whereOf(prisma).message as { contains: string }).contains;
    for (const code of [0, 701003, 703000, 704010]) {
      expect(rawLine(code, 'Receipt.Sale', 'x')).toContain(needle);
    }
  });

  it('refuses something that is not a VCR code', async () => {
    const { service } = build();
    for (const vcrCode of ['7010', 'abc', '701003]', '%']) {
      await expect(service.getLogs('SUPER_ADMIN', null, { vcrCode })).rejects.toBeInstanceOf(
        BadRequestException,
      );
    }
  });

  it('combines with the other filters, and keeps a store admin to their own store', async () => {
    const { service, prisma } = build();
    await service.getLogs('ADMIN', 's1', { vcrCode: '701003', level: 'error', storeId: 'other' });
    expect(whereOf(prisma)).toMatchObject({ storeId: 's1', level: 'error' });
  });

  it('adds nothing when no code is asked for', async () => {
    const { service, prisma } = build();
    await service.getLogs('SUPER_ADMIN', null, {});
    expect(whereOf(prisma)).not.toHaveProperty('message');
  });
});

describe('the codes offered as suggestions', () => {
  it('lists the codes seen, most frequent first, skipping lines it could not read', async () => {
    const { service } = build([
      { code: '701003', count: 12, latest: 'Ставка НДС запрещена' },
      { code: '703000', count: BigInt(2), latest: null },
      { code: null, count: 1, latest: null },
    ]);
    const meta = await service.getMeta('SUPER_ADMIN', null);
    expect(meta.vcrCodes).toEqual([
      { code: '701003', count: 12, latest: 'Ставка НДС запрещена' },
      { code: '703000', count: 2, latest: null },
    ]);
  });

  it('offers a store admin with no store nothing', async () => {
    const { service, prisma } = build([{ code: '701003', count: 1, latest: null }]);
    expect((await service.getMeta('ADMIN', null)).vcrCodes).toEqual([]);
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });
});
