import { ipcMain } from 'electron';
import { getPrismaClient } from '../database/sqlite-client';
import {
  LABEL_PRINTER_KEYS,
  parseLabelPrinterConfig,
  validateLabelPrinterConfig,
} from '../printer/label-printer-config';
import { LabelPrinterError, LabelPrinterService } from '../printer/label-printer.service';
import { buildFullTSPL, toCP1251, type TsplPrintRequest } from '../printer/tspl-builder';
import type {
  LabelPrinterConfig,
  LabelPrinterResult,
  SerialPortInfo,
} from '../../shared/types/label-printer.types';

function ipcSafe<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

// One service for the app, so every print goes through the same queue.
let service: LabelPrinterService | null = null;
function getService(): LabelPrinterService {
  if (!service) service = new LabelPrinterService();
  return service;
}

async function readConfig(): Promise<LabelPrinterConfig> {
  const rows = await getPrismaClient().systemSetting.findMany({
    where: { key: { in: Object.values(LABEL_PRINTER_KEYS) } },
  });
  return parseLabelPrinterConfig(
    Object.fromEntries(rows.map((r: { key: string; value: string }) => [r.key, r.value])),
  );
}

/** Run a printer call and turn a LabelPrinterError into data — Electron drops error classes. */
async function asResult(fn: () => Promise<void>): Promise<LabelPrinterResult> {
  try {
    await fn();
    return { ok: true };
  } catch (err) {
    if (err instanceof LabelPrinterError) {
      console.warn(`[label-printer] ${err.code}: ${err.message}`);
      return { ok: false, code: err.code, message: err.message };
    }
    console.error('[label-printer] unexpected:', err);
    return { ok: false, code: 'WRITE_FAILED', message: (err as Error).message ?? String(err) };
  }
}

export function setupLabelPrinterHandlers(): void {
  ipcMain.handle('labelPrinter:listPorts', async (): Promise<SerialPortInfo[]> => {
    return ipcSafe(await getService().listPorts());
  });

  ipcMain.handle('labelPrinter:getConfig', async (): Promise<LabelPrinterConfig> => {
    return ipcSafe(await readConfig());
  });

  ipcMain.handle(
    'labelPrinter:setConfig',
    async (_event, input: unknown): Promise<LabelPrinterConfig> => {
      const config = validateLabelPrinterConfig(input);
      const prisma = getPrismaClient();
      await prisma.$transaction(
        (Object.keys(LABEL_PRINTER_KEYS) as (keyof LabelPrinterConfig)[]).map((field) =>
          prisma.systemSetting.upsert({
            where: { key: LABEL_PRINTER_KEYS[field] },
            update: { value: String(config[field]) },
            create: { key: LABEL_PRINTER_KEYS[field], value: String(config[field]) },
          }),
        ),
      );
      return ipcSafe(config);
    },
  );

  ipcMain.handle('labelPrinter:testPrint', async (): Promise<LabelPrinterResult> => {
    const cfg = await readConfig();
    return ipcSafe(await asResult(() => getService().testPrint(cfg)));
  });

  /**
   * Price tags over the COM port. Same request the spooler path takes; the gap comes from this
   * printer's settings, the size from the template.
   */
  ipcMain.handle(
    'labelPrinter:print',
    async (_event, req: TsplPrintRequest): Promise<LabelPrinterResult> => {
      if (!req || !Array.isArray(req.items) || req.items.length === 0) {
        throw new Error('Nothing to print');
      }
      const cfg = await readConfig();
      const tspl = buildFullTSPL({ ...req, gapMm: cfg.gapMm }, { copies: 'perLabel' });
      return ipcSafe(
        await asResult(() =>
          getService().print({ port: cfg.port, baudRate: cfg.baudRate, data: toCP1251(tspl) }),
        ),
      );
    },
  );
}
