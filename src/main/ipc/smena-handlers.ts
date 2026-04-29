import { ipcMain } from 'electron';
import { getPrismaClient } from '../database/sqlite-client';
import { getCurrentUser } from './auth-handlers';
import { getAppConfig } from '../config/app-config';
import { openCashDrawer } from '../printer/thermal-printer';
import { printZXReport } from '../printer/smena-report-printer';
import type { SmenaStats } from '../../shared/types/smena.types';

function ipcSafe<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

async function computeSmenaStats(smenaId: string): Promise<SmenaStats> {
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
    if (row.payment_method === 'cash') {
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

export function setupSmenaHandlers(): void {
  ipcMain.handle('smena:getCurrent', async () => {
    const prisma = getPrismaClient();
    const config = getAppConfig();

    const smena = await prisma.smena.findFirst({
      where: { terminalId: config.terminalId, status: 'OPEN' },
      include: { movements: { orderBy: { createdAt: 'asc' } } },
    });

    if (!smena) return null;

    const stats = await computeSmenaStats(smena.id);

    return ipcSafe({ ...smena, stats });
  });

  ipcMain.handle('smena:open', async (_event, data: { initialCash: number }) => {
    const currentUser = getCurrentUser();
    if (!currentUser) throw new Error('Not authenticated');

    const prisma = getPrismaClient();
    const config = getAppConfig();

    // Block if already open
    const existing = await prisma.smena.findFirst({
      where: { terminalId: config.terminalId, status: 'OPEN' },
    });
    if (existing) throw new Error('SMENA_ALREADY_OPEN');

    // Next Z-report number for this terminal
    const maxRow = (await prisma.$queryRawUnsafe(
      `SELECT MAX(z_report_number) as max_z FROM smenas WHERE terminal_id = ?`,
      config.terminalId
    )) as Array<{ max_z: number | null }>;
    const nextZ = (maxRow[0]?.max_z ?? 0) + 1;

    const smena = await prisma.smena.create({
      data: {
        terminalId: config.terminalId,
        cashierId: currentUser.id,
        cashierName: currentUser.nameRu,
        status: 'OPEN',
        initialCash: data.initialCash,
        zReportNumber: nextZ,
        synced: false,
      },
    });

    openCashDrawer().catch((err) =>
      console.error('[Smena] Cash drawer error on open:', err)
    );

    return ipcSafe(smena);
  });

  ipcMain.handle('smena:addMovement', async (_event, data: {
    smenaId: string;
    type: 'PAY_IN' | 'PAY_OUT';
    amount: number;
    note?: string;
  }) => {
    const prisma = getPrismaClient();

    const smena = await prisma.smena.findUnique({ where: { id: data.smenaId } });
    if (!smena || smena.status !== 'OPEN') throw new Error('SMENA_NOT_OPEN');

    const movement = await prisma.smenaMovement.create({
      data: {
        smenaId: data.smenaId,
        type: data.type,
        amount: data.amount,
        note: data.note ?? null,
      },
    });

    if (data.type === 'PAY_IN') {
      openCashDrawer().catch((err) =>
        console.error('[Smena] Cash drawer error on PAY_IN:', err)
      );
    }

    return ipcSafe(movement);
  });

  ipcMain.handle('smena:close', async (_event, data: {
    smenaId: string;
    finalCash: number;
  }) => {
    const prisma = getPrismaClient();

    const smena = await prisma.smena.findUnique({
      where: { id: data.smenaId },
      include: { movements: true },
    });
    if (!smena || smena.status !== 'OPEN') throw new Error('SMENA_NOT_OPEN');

    const stats = await computeSmenaStats(data.smenaId);

    const closedSmena = await prisma.smena.update({
      where: { id: data.smenaId },
      data: {
        status: 'CLOSED',
        finalCash: data.finalCash,
        closedAt: new Date(),
      },
      include: { movements: true },
    });

    // Print Z-report
    try {
      await printZXReport({
        smena: {
          ...ipcSafe(closedSmena),
          initialCash: Number(closedSmena.initialCash),
          finalCash: Number(closedSmena.finalCash),
        },
        stats,
        isXReport: false,
      });
    } catch (err) {
      console.error('[Smena] Z-report print error:', err);
    }

    return ipcSafe({ ...closedSmena, stats });
  });

  ipcMain.handle('smena:printZReport', async (_event, smenaId: string) => {
    const prisma = getPrismaClient();

    const smena = await prisma.smena.findUnique({
      where: { id: smenaId },
      include: { movements: true },
    });
    if (!smena) throw new Error('Smena not found');

    const stats = await computeSmenaStats(smenaId);

    await printZXReport({
      smena: {
        ...ipcSafe(smena),
        initialCash: Number(smena.initialCash),
        finalCash: smena.finalCash != null ? Number(smena.finalCash) : null,
      },
      stats,
      isXReport: false,
    });

    return true;
  });

  ipcMain.handle('smena:printXReport', async (_event, smenaId: string) => {
    const prisma = getPrismaClient();

    const smena = await prisma.smena.findUnique({
      where: { id: smenaId },
    });
    if (!smena || smena.status !== 'OPEN') throw new Error('SMENA_NOT_OPEN');

    const stats = await computeSmenaStats(smenaId);

    await printZXReport({
      smena: {
        ...ipcSafe(smena),
        initialCash: Number(smena.initialCash),
        finalCash: null,
      },
      stats,
      isXReport: true,
    });

    return true;
  });

  ipcMain.handle('smena:getHistory', async (_event, filters?: { limit?: number }) => {
    const prisma = getPrismaClient();
    const config = getAppConfig();

    const smenas = await prisma.smena.findMany({
      where: { terminalId: config.terminalId },
      orderBy: { openedAt: 'desc' },
      take: filters?.limit ?? 50,
    });

    const results = await Promise.all(
      smenas.map(async (s: typeof smenas[number]) => {
        const stats = await computeSmenaStats(s.id);
        return {
          ...s,
          initialCash: Number(s.initialCash),
          finalCash: s.finalCash != null ? Number(s.finalCash) : null,
          stats,
        };
      })
    );

    return ipcSafe(results);
  });
}
