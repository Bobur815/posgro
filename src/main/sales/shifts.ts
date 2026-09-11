import { getPrismaClient } from '../database/sqlite-client';
import { isCashTender } from '../../shared/constants';
import type { SmenaStats, SmenaFiscalStats } from '../../shared/types/smena.types';
import { serially } from './commit-sale';

/**
 * Shifts (smena), per terminal.
 *
 * The database side only — no cash drawer, no VCR, no printer. Those belong to the till that is
 * physically there, so `ipc/smena-handlers.ts` wraps these for this till and a main terminal's LAN
 * route wraps them for a satellite (tasks/LAN_MAIN_TERMINAL_PLAN.md §5.14). A shift already carries
 * `terminalId`, so every function here takes the terminal it acts for rather than reading this
 * machine's own.
 *
 * Opening and closing run in the same queue as sale commits (`serially`), so a sale cannot be filed
 * under a shift that closed a moment earlier, and a double-tap cannot open two shifts.
 */

function plain<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

/** Per-shift fiscalization aggregates (REGOS:VCR) derived from its sales. */
export async function computeFiscalStats(smenaId: string): Promise<SmenaFiscalStats> {
  const prisma = getPrismaClient();
  type Row = { fiscal_status: string | null; cnt: number; total: number };
  const rows = (await prisma.$queryRawUnsafe(
    `SELECT fiscal_status, COUNT(*) as cnt, COALESCE(SUM(final_amount), 0) as total
     FROM sales WHERE smena_id = ? GROUP BY fiscal_status`,
    smenaId,
  )) as Row[];
  let fiscalizedCount = 0, fiscalizedAmount = 0, pendingCount = 0, failedCount = 0;
  for (const r of rows) {
    const cnt = Number(r.cnt);
    if (r.fiscal_status === 'FISCALIZED') { fiscalizedCount = cnt; fiscalizedAmount = Number(r.total); }
    else if (r.fiscal_status === 'PENDING') pendingCount = cnt;
    else if (r.fiscal_status === 'FAILED') failedCount = cnt;
  }
  return { fiscalizedCount, fiscalizedAmount, pendingCount, failedCount };
}

export async function computeSmenaStats(smenaId: string): Promise<SmenaStats> {
  const prisma = getPrismaClient();

  type SalesRow = { payment_method: string; cnt: number; total: number; discounts: number };

  // Sales by payment method
  const salesRows = (await prisma.$queryRawUnsafe(
    `SELECT payment_method,
            COUNT(*) as cnt,
            COALESCE(SUM(final_amount), 0) as total,
            COALESCE(SUM(discount_amount), 0) as discounts
     FROM sales
     WHERE smena_id = ?
     GROUP BY payment_method`,
    smenaId
  )) as SalesRow[];

  let cashSalesCount = 0;
  let cashSalesAmount = 0;
  let cardSalesCount = 0;
  let cardSalesAmount = 0;
  let totalDiscounts = 0;

  for (const row of salesRows) {
    const cnt = Number(row.cnt);
    const total = Number(row.total);
    const disc = Number(row.discounts);
    // Cash is the only tender that lands in the drawer; card AND UzQR both settle to the
    // bank, so they share the cashless bucket. Keyed on "is it cash" rather than listing
    // tenders, so a future tender can never be counted as money in the till by accident.
    if (isCashTender(row.payment_method)) {
      cashSalesCount += cnt;
      cashSalesAmount += total;
    } else {
      cardSalesCount += cnt;
      cardSalesAmount += total;
    }
    totalDiscounts += disc;
  }

  type MovRow = { type: string; total: number };

  // Movements
  const movRows = (await prisma.$queryRawUnsafe(
    `SELECT type, COALESCE(SUM(amount), 0) as total
     FROM smena_movements
     WHERE smena_id = ?
     GROUP BY type`,
    smenaId
  )) as MovRow[];

  let payInTotal = 0;
  let payOutTotal = 0;
  for (const row of movRows) {
    if (row.type === 'PAY_IN') payInTotal = Number(row.total);
    else if (row.type === 'PAY_OUT') payOutTotal = Number(row.total);
  }

  type ReturnRow = { cnt: number; total: number };

  // Returns from audit_logs (deleted sales in this smena)
  const returnRows = (await prisma.$queryRawUnsafe(
    `SELECT COUNT(*) as cnt,
            COALESCE(SUM(CAST(json_extract(details, '$.finalAmount') AS REAL)), 0) as total
     FROM audit_logs
     WHERE action = 'delete_sale'
       AND json_extract(details, '$.smenaId') = ?`,
    smenaId
  )) as ReturnRow[];

  const returnCount = returnRows.length > 0 ? Number(returnRows[0].cnt) : 0;
  const returnAmount = returnRows.length > 0 ? Number(returnRows[0].total) : 0;

  const totalRevenue = cashSalesAmount + cardSalesAmount;

  return {
    cashSalesCount,
    cashSalesAmount,
    cardSalesCount,
    cardSalesAmount,
    totalRevenue,
    totalDiscounts,
    returnCount,
    returnAmount,
    payInTotal,
    payOutTotal,
  };
}

/** A shift as the renderer receives it: money as numbers, not Decimals. */
function shape<T extends { initialCash: unknown; finalCash: unknown }>(smena: T) {
  return {
    ...plain(smena),
    initialCash: Number(smena.initialCash),
    finalCash: smena.finalCash != null ? Number(smena.finalCash) : null,
  };
}

/** The terminal's open shift with its running figures, or null. */
export async function currentShift(terminalId: string) {
  const smena = await getPrismaClient().smena.findFirst({
    where: { terminalId, status: 'OPEN' },
    include: { movements: { orderBy: { createdAt: 'asc' } } },
  });
  if (!smena) return null;
  return { ...shape(smena), stats: await computeSmenaStats(smena.id) };
}

export function openShift(
  terminalId: string,
  cashier: { id: string; nameRu: string },
  initialCash: number,
) {
  return serially(async () => {
    const prisma = getPrismaClient();

    const existing = await prisma.smena.findFirst({ where: { terminalId, status: 'OPEN' } });
    if (existing) throw new Error('SMENA_ALREADY_OPEN');

    // Next Z-report number for this terminal
    const maxRow = (await prisma.$queryRawUnsafe(
      `SELECT MAX(z_report_number) as max_z FROM smenas WHERE terminal_id = ?`,
      terminalId,
    )) as Array<{ max_z: number | bigint | null }>;
    const nextZ = Number(maxRow[0]?.max_z ?? 0) + 1;

    const smena = await prisma.smena.create({
      data: {
        terminalId,
        cashierId: cashier.id,
        cashierName: cashier.nameRu,
        status: 'OPEN',
        initialCash,
        zReportNumber: nextZ,
        synced: false,
      },
    });
    return plain(smena);
  });
}

/**
 * The shift, if `terminalId` may act on it. A satellite passes its own id so it can never touch
 * another till's drawer; the till's own IPC passes none and is trusted with its whole database.
 */
async function ownShift(smenaId: string, terminalId?: string) {
  const smena = await getPrismaClient().smena.findUnique({
    where: { id: smenaId },
    include: { movements: true },
  });
  if (!smena || (terminalId && smena.terminalId !== terminalId)) return null;
  return smena;
}

/**
 * In the queue too: a pay-in filed against a shift that is closing at that moment would miss the
 * Z-report — and the queue is where a handoff's write freeze is enforced (§11.4).
 */
export function addShiftMovement(
  data: { smenaId: string; type: 'PAY_IN' | 'PAY_OUT'; amount: number; note?: string },
  terminalId?: string,
) {
  return serially(async () => {
    const smena = await ownShift(data.smenaId, terminalId);
    if (!smena || smena.status !== 'OPEN') throw new Error('SMENA_NOT_OPEN');

    const movement = await getPrismaClient().smenaMovement.create({
      data: {
        smenaId: data.smenaId,
        type: data.type,
        amount: data.amount,
        note: data.note ?? null,
      },
    });
    return plain(movement);
  });
}

export function closeShift(smenaId: string, finalCash: number, terminalId?: string) {
  return serially(async () => {
    const smena = await ownShift(smenaId, terminalId);
    if (!smena || smena.status !== 'OPEN') throw new Error('SMENA_NOT_OPEN');

    const stats = await computeSmenaStats(smenaId);
    const closed = await getPrismaClient().smena.update({
      where: { id: smenaId },
      data: { status: 'CLOSED', finalCash, closedAt: new Date() },
      include: { movements: true },
    });
    return { smena: shape(closed), stats };
  });
}

/** A shift and its figures, for printing its Z- or X-report. */
export async function shiftReport(smenaId: string, terminalId?: string) {
  const smena = await ownShift(smenaId, terminalId);
  if (!smena) return null;
  return { smena: shape(smena), stats: await computeSmenaStats(smenaId) };
}

export async function shiftHistory(terminalId: string, limit = 50) {
  const smenas = await getPrismaClient().smena.findMany({
    where: { terminalId },
    orderBy: { openedAt: 'desc' },
    take: limit,
    include: { movements: { orderBy: { createdAt: 'asc' } } },
  });

  return Promise.all(
    smenas.map(async (s: (typeof smenas)[number]) => ({
      ...shape(s),
      movements: s.movements.map((m: (typeof s.movements)[number]) => ({
        ...plain(m),
        amount: Number(m.amount),
      })),
      stats: await computeSmenaStats(s.id),
      fiscal: await computeFiscalStats(s.id),
    })),
  );
}
