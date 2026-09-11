import { ipcMain } from 'electron';
import { getCurrentUser } from './auth-handlers';
import { getAppConfig } from '../config/app-config';
import { openCashDrawer } from '../printer/thermal-printer';
import { printZXReport } from '../printer/smena-report-printer';
import { regosVcrService } from '../fiscal/regos-vcr-service';
import {
  addShiftMovement,
  closeShift,
  currentShift,
  openShift,
  shiftHistory,
  shiftReport,
} from '../sales/shifts';
import { isSatellite } from '../lan/role';
import * as satellite from '../lan/satellite-ops';

/**
 * This till's shifts. The database side lives in `sales/shifts.ts`, shared with a main terminal
 * answering its satellites; what stays here is what only the machine at the till can do — open its
 * cash drawer, drive its VCR, print on its printer.
 */
export function setupSmenaHandlers(): void {
  ipcMain.handle('smena:getCurrent', async () =>
    (await isSatellite()) ? satellite.getCurrentShift() : currentShift(getAppConfig().terminalId),
  );

  ipcMain.handle('smena:open', async (_event, data: { initialCash: number }) => {
    const currentUser = getCurrentUser();
    if (!currentUser) throw new Error('Not authenticated');

    // A satellite's shift lives on its main (§5.14); the drawer is still this till's own.
    if (await isSatellite()) return satellite.openShift(data.initialCash);

    const smena = await openShift(getAppConfig().terminalId, currentUser, data.initialCash);

    openCashDrawer().catch((err) =>
      console.error('[Smena] Cash drawer error on open:', err)
    );

    // Open the REGOS:VCR Z-report for this shift (best-effort, only if fiscal enabled)
    void regosVcrService.openShift(smena.id);

    return smena;
  });

  ipcMain.handle('smena:addMovement', async (_event, data: {
    smenaId: string;
    type: 'PAY_IN' | 'PAY_OUT';
    amount: number;
    note?: string;
  }) => {
    if (await isSatellite()) return satellite.addMovement(data);

    const movement = await addShiftMovement(data);

    if (data.type === 'PAY_IN') {
      openCashDrawer().catch((err) =>
        console.error('[Smena] Cash drawer error on PAY_IN:', err)
      );
    }

    return movement;
  });

  ipcMain.handle('smena:close', async (_event, data: {
    smenaId: string;
    finalCash: number;
  }) => {
    if (await isSatellite()) return satellite.closeShift(data.smenaId, data.finalCash);

    const { smena, stats } = await closeShift(data.smenaId, data.finalCash);

    // Flush any pending fiscalizations into this shift, then close the VCR Z-report.
    // Best-effort — must not block shift close if the VCR is unavailable.
    try {
      await regosVcrService.processPending();
      await regosVcrService.closeZReport();
    } catch (err) {
      console.error('[Smena] REGOS Z-report close failed:', err instanceof Error ? err.message : err);
    }

    // Print Z-report
    try {
      await printZXReport({ smena, stats, isXReport: false });
    } catch (err) {
      console.error('[Smena] Z-report print error:', err);
    }

    return { ...smena, stats };
  });

  ipcMain.handle('smena:printZReport', async (_event, smenaId: string) => {
    if (await isSatellite()) return satellite.printShiftReport(smenaId, false);

    const report = await shiftReport(smenaId);
    if (!report) throw new Error('Smena not found');

    await printZXReport({ ...report, isXReport: false });
    return true;
  });

  ipcMain.handle('smena:printXReport', async (_event, smenaId: string) => {
    if (await isSatellite()) return satellite.printShiftReport(smenaId, true);

    const report = await shiftReport(smenaId);
    if (!report || report.smena.status !== 'OPEN') throw new Error('SMENA_NOT_OPEN');

    await printZXReport({ smena: { ...report.smena, finalCash: null }, stats: report.stats, isXReport: true });
    return true;
  });

  ipcMain.handle('smena:getHistory', async (_event, filters?: { limit?: number }) =>
    (await isSatellite())
      ? satellite.getShiftHistory(filters?.limit ?? 50)
      : shiftHistory(getAppConfig().terminalId, filters?.limit ?? 50),
  );
}
