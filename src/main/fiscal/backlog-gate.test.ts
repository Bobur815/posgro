/**
 * The paid gate in front of the fiscal backlog steps: refused unless the store's license has the
 * service open, and every step that runs is written to the audit log.
 */
const fiscalBacklogOpen = jest.fn<Promise<boolean>, []>();
jest.mock('../license/license', () => ({ fiscalBacklogOpen: () => fiscalBacklogOpen() }));

const executeRaw = jest.fn<Promise<number>, unknown[]>(async () => 1);
jest.mock('../database/sqlite-client', () => ({
  getPrismaClient: () => ({ $executeRawUnsafe: (...args: unknown[]) => executeRaw(...args) }),
}));

import { NOT_ENTITLED, runEntitled } from './backlog-gate';

const EMPTY = { ok: false, fiscalized: 0, failed: [] as Array<{ receipt: string; error: string }> };
const ACTOR = { id: 'u1', phone: '998900000001' };

beforeEach(() => jest.clearAllMocks());

describe('runEntitled', () => {
  it('refuses, without running the step, while the service is not open', async () => {
    fiscalBacklogOpen.mockResolvedValue(false);
    const run = jest.fn(async () => ({ ok: true, fiscalized: 3, failed: [] }));

    const r = await runEntitled('fiscalize', '2026-10-01', ACTOR, EMPTY, run);

    expect(r).toEqual({ ok: false, error: NOT_ENTITLED, fiscalized: 0, failed: [] });
    expect(run).not.toHaveBeenCalled();
    expect(executeRaw).not.toHaveBeenCalled();
  });

  it('runs the step and records who ran it and what it did', async () => {
    fiscalBacklogOpen.mockResolvedValue(true);
    const result = { ok: true, fiscalized: 2, failed: [{ receipt: 'R1', error: 'x' }] };

    const r = await runEntitled('fiscalize', '2026-10-01', ACTOR, EMPTY, async () => result);

    expect(r).toBe(result);
    const [sql, , userId, phone, action, fromDate, details] = executeRaw.mock.calls[0];
    expect(String(sql)).toContain('INSERT INTO audit_logs');
    expect([userId, phone, action, fromDate]).toEqual([
      'u1',
      '998900000001',
      'FISCAL_BACKLOG_FISCALIZE',
      '2026-10-01',
    ]);
    // Counts, not receipt lists.
    expect(JSON.parse(String(details))).toEqual({ ok: true, fiscalized: 2, failed: 1 });
  });

  it('still returns the step result when the audit row cannot be written', async () => {
    fiscalBacklogOpen.mockResolvedValue(true);
    executeRaw.mockRejectedValueOnce(new Error('disk full'));
    const result = { ok: true, fiscalized: 1, failed: [] };
    const spy = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    await expect(
      runEntitled('fiscalize', '2026-10-01', ACTOR, EMPTY, async () => result),
    ).resolves.toBe(result);
    spy.mockRestore();
  });
});
