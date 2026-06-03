import { ipcMain } from 'electron';
import { regosVcrService } from '../fiscal/regos-vcr-service';
import type { RegosVcrConfigInput } from '../../shared/types/fiscal.types';

export function setupFiscalHandlers(): void {
  ipcMain.handle('fiscal:getConfig', async () => regosVcrService.getConfig());

  ipcMain.handle('fiscal:setConfig', async (_event, input: RegosVcrConfigInput) =>
    regosVcrService.setConfig(input),
  );

  ipcMain.handle('fiscal:testConnection', async () => regosVcrService.testConnection());

  ipcMain.handle('fiscal:getStatus', async () => regosVcrService.getQueueStatus());

  ipcMain.handle('fiscal:retrySale', async (_event, saleId: string) => {
    await regosVcrService.retrySale(saleId);
    return true;
  });

  ipcMain.handle('fiscal:refund', async (_event, saleId: string) =>
    regosVcrService.refundSale(saleId),
  );

  ipcMain.handle('fiscal:printDuplicate', async (_event, saleId: string) =>
    regosVcrService.printDuplicate(saleId),
  );
}
