import { ipcMain } from "electron";
import { regosVcrService } from "../fiscal/regos-vcr-service";
import { stats, recentSales, reset } from "../fiscal/fiscal-timing";
import type {
  FiscalBacklogProgress,
  RegosVcrConfigInput,
} from "../../shared/types/fiscal.types";
import { assertNotSatellite } from "../lan/satellite-guard";
import { isSatellite } from "../lan/role";
import * as satellite from "../lan/satellite-ops";

/**
 * Actions that drive the VCR. On a satellite there is none — it is a local service on the main (LAN
 * plan §5.11) — so these are refused there rather than failing on a connection to nothing.
 */
function mainOnly<A extends unknown[], R>(fn: (...args: A) => Promise<R>) {
  return async (...args: A): Promise<R> => {
    await assertNotSatellite();
    return fn(...args);
  };
}

export function setupFiscalHandlers(): void {
  ipcMain.handle("fiscal:getConfig", async () => regosVcrService.getConfig());

  ipcMain.handle(
    "fiscal:setConfig",
    mainOnly(async (_event, input: RegosVcrConfigInput) =>
      regosVcrService.setConfig(input),
    ),
  );

  ipcMain.handle(
    "fiscal:testConnection",
    mainOnly(async () => regosVcrService.testConnection()),
  );

  ipcMain.handle("fiscal:getStatus", async () =>
    regosVcrService.getQueueStatus(),
  );

  // Fiscalization timings — per-phase aggregates plus the last few per-sale breakdowns. Answers
  // "why did that receipt take so long" with numbers instead of guesses. In-memory, so it covers
  // this app session only; the same lines also go to the uploaded logs via electron-log.
  ipcMain.handle("fiscal:getTimings", async () => ({
    phases: stats(),
    recent: recentSales(),
  }));

  ipcMain.handle("fiscal:resetTimings", async () => {
    reset();
    return true;
  });

  // On a satellite the main's device does it (lan/satellite-ops.ts#retryFiscal).
  ipcMain.handle("fiscal:retrySale", async (_event, saleId: string) =>
    (await isSatellite()) ? satellite.retryFiscal(saleId) : regosVcrService.retrySale(saleId),
  );

  // Read-only: reconstruct the exact Receipt.Sale payload sent to REGOS:VCR for a receipt,
  // for the Receipt Details modal. No VCR call, no writes.
  ipcMain.handle("fiscal:previewPayload", async (_event, saleId: string) =>
    regosVcrService.previewSalePayload(saleId),
  );

  // Fiscal backlog stepper (Fiscal Settings). Four steps, each pressed by the admin; the long ones
  // stream progress to the caller's window over 'fiscal:backlogProgress'.
  const progressTo = (event: Electron.IpcMainInvokeEvent) => (p: FiscalBacklogProgress) => {
    if (!event.sender.isDestroyed()) event.sender.send("fiscal:backlogProgress", p);
  };
  ipcMain.handle("fiscal:backlogBusy", async () => regosVcrService.backlogBusy());
  ipcMain.handle(
    "fiscal:backlogClassify",
    mainOnly(async (_event, fromDate: string) => regosVcrService.backlogClassify(fromDate)),
  );
  ipcMain.handle(
    "fiscal:backlogRepair",
    mainOnly(async (_event, fromDate: string) => regosVcrService.backlogRepair(fromDate)),
  );
  ipcMain.handle(
    "fiscal:backlogVerify",
    mainOnly(async (event: Electron.IpcMainInvokeEvent, fromDate: string) =>
      regosVcrService.backlogVerify(fromDate, progressTo(event)),
    ),
  );
  ipcMain.handle(
    "fiscal:backlogFiscalize",
    mainOnly(async (event: Electron.IpcMainInvokeEvent, fromDate: string) =>
      regosVcrService.backlogFiscalize(fromDate, progressTo(event)),
    ),
  );

  ipcMain.handle(
    "fiscal:refund",
    mainOnly(async (_event, saleId: string) => regosVcrService.refundSale(saleId)),
  );

  ipcMain.handle(
    "fiscal:printDuplicate",
    mainOnly(async (_event, saleId: string) => regosVcrService.printDuplicate(saleId)),
  );

  // Z-report (fiscal shift) — status + manual open/close for the Smena page. On a satellite there
  // is no VCR to ask (its main fiscalizes for it), so it reports fiscalization as off here and the
  // shift page shows no fiscal panel — rather than an error from a device that is not there.
  ipcMain.handle("fiscal:zInfo", async () =>
    (await isSatellite())
      ? { enabled: false, open: false }
      : regosVcrService.getZReportInfo(),
  );
  ipcMain.handle(
    "fiscal:zOpen",
    mainOnly(async () => regosVcrService.openZReportManual()),
  );
  ipcMain.handle(
    "fiscal:zClose",
    mainOnly(async () => regosVcrService.closeZReportManual()),
  );
}
