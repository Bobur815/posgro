import { BrowserWindow } from 'electron';
import { syncSales } from './sales-sync';
import { syncProducts, syncCategories, syncSuppliers, syncUsers } from './products-sync';
import { uploadLocalData } from './upload-sync';
import { getAppConfig } from '../config/app-config';
import { getPrismaClient } from '../database/sqlite-client';
import { getServerToken } from './queue-manager';

export class SyncService {
  private syncInterval: NodeJS.Timeout | null = null;
  private isSyncing = false;
  private lastSyncTime: Date | null = null;
  private lastError: string | null = null;

  start(): void {

    // Initial sync after a short delay (faster in dev/local mode)
    const config = getAppConfig();
    const isLocal = config.vpsApiUrl.includes('localhost') || config.vpsApiUrl.includes('127.0.0.1');
    setTimeout(() => {
      this.sync();
    }, isLocal ? 1000 : 5000);

    // Periodic sync
    this.syncInterval = setInterval(() => {
      this.sync();
    }, config.syncIntervalMs);
  }

  stop(): void {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
  }

  async sync(): Promise<void> {
    if (this.isSyncing) {
      return;
    }

    this.isSyncing = true;
    this.lastError = null;

    try {
      // Check internet connectivity
      const isOnline = await this.checkConnectivity();
      if (!isOnline) {
        return;
      }


      // Upload locally-created categories, suppliers, products, and arrivals to VPS
      try {
        await uploadLocalData();
      } catch (uploadError) {
        console.error('Upload sync failed (non-fatal):', uploadError instanceof Error ? uploadError.message : uploadError);
      }

      // Sync sales (upload local sales to VPS)
      await syncSales();

      // Sync categories (download from VPS — must come before products)
      await syncCategories();

      // Sync suppliers and users (download from VPS to all terminals)
      await syncSuppliers();
      await syncUsers();

      // Sync products (download updated products from VPS)
      const stockConflicts = await syncProducts();

      // Pull store config (AI token limit, etc.) from VPS
      await this.syncStoreConfig();

      // Send heartbeat to VPS so admins can monitor all terminals
      await this.sendHeartbeat();

      this.lastSyncTime = new Date();

      // Notify renderer process
      this.notifyRenderer('sync:completed');

      // Warn if any products have negative stock after VPS overwrite
      if (stockConflicts.length > 0) {
        this.notifyRenderer('sync:stockConflict', stockConflicts);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.lastError = errorMessage;
      console.error('Sync failed:', errorMessage);

      // Notify renderer about error
      this.notifyRenderer('sync:failed', { message: errorMessage });
    } finally {
      this.isSyncing = false;
    }
  }

  // Fetches server-controlled config keys (e.g. AI token limit) from VPS.
  // The VPS should expose GET /store-config returning { ai_token_limit_daily: number }.
  // Silently skips if the endpoint is unavailable.
  private async syncStoreConfig(): Promise<void> {
    const config = getAppConfig();
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      const token = getServerToken();
      const response = await fetch(`${config.vpsApiUrl}/store-config`, {
        signal: controller.signal,
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      clearTimeout(timeoutId);
      if (!response.ok) return;

      const data = await response.json() as Record<string, unknown>;
      const prisma = getPrismaClient();

      if (typeof data.ai_token_limit_daily === 'number') {
        await prisma.systemSetting.upsert({
          where: { key: 'ai_token_limit_daily' },
          update: { value: String(data.ai_token_limit_daily) },
          create: { key: 'ai_token_limit_daily', value: String(data.ai_token_limit_daily) },
        });
      }
    } catch {
      // Offline or endpoint not yet implemented — use cached limit
    }
  }

  private async sendHeartbeat(): Promise<void> {
    const config = getAppConfig();
    const token = getServerToken();
    if (!token) return;

    try {
      const prisma = getPrismaClient();
      const unsyncedCount = await prisma.sale.count({ where: { synced: false } });
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      await fetch(`${config.vpsApiUrl}/terminals/heartbeat`, {
        method: 'POST',
        signal: controller.signal,
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          terminalId: config.terminalId,
          storeId: config.storeId,
          unsyncedCount,
          lastSyncAt: new Date().toISOString(),
        }),
      });
      clearTimeout(timeoutId);
    } catch {
      // Heartbeat is fire-and-forget — VPS endpoint may not exist yet
    }
  }

  private async checkConnectivity(): Promise<boolean> {
    const config = getAppConfig();

    // Skip connectivity check for local development
    const isLocal = config.vpsApiUrl.includes('localhost') || config.vpsApiUrl.includes('127.0.0.1');
    if (isLocal) {
      return true;
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const response = await fetch(`${config.vpsApiUrl}/health`, {
        method: 'GET',
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      return response.ok;
    } catch {
      return false;
    }
  }

  private notifyRenderer(channel: string, data?: unknown): void {
    const windows = BrowserWindow.getAllWindows();
    if (windows.length > 0) {
      windows[0].webContents.send(channel, data);
    }
  }

  getStatus(): {
    isSyncing: boolean;
    lastSyncTime: Date | null;
    lastError: string | null;
  } {
    return {
      isSyncing: this.isSyncing,
      lastSyncTime: this.lastSyncTime,
      lastError: this.lastError,
    };
  }

  // Force immediate sync
  async triggerSync(): Promise<void> {
    await this.sync();
  }
}
