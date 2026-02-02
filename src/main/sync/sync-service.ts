import { BrowserWindow } from 'electron';
import { syncSales } from './sales-sync';
import { syncProducts } from './products-sync';
import { getAppConfig } from '../config/app-config';

export class SyncService {
  private syncInterval: NodeJS.Timeout | null = null;
  private isSyncing = false;
  private lastSyncTime: Date | null = null;
  private lastError: string | null = null;

  start(): void {
    console.log('Sync service started');

    // Initial sync after a short delay
    setTimeout(() => {
      this.sync();
    }, 5000);

    // Periodic sync
    const config = getAppConfig();
    this.syncInterval = setInterval(() => {
      this.sync();
    }, config.syncIntervalMs);
  }

  stop(): void {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
    console.log('Sync service stopped');
  }

  async sync(): Promise<void> {
    if (this.isSyncing) {
      console.log('Sync already in progress, skipping...');
      return;
    }

    this.isSyncing = true;
    this.lastError = null;

    try {
      // Check internet connectivity
      const isOnline = await this.checkConnectivity();
      if (!isOnline) {
        console.log('No internet connection, skipping sync');
        return;
      }

      console.log('Starting sync...');

      // Sync sales (upload local sales to VPS)
      await syncSales();

      // Sync products (download updated products from VPS)
      await syncProducts();

      this.lastSyncTime = new Date();
      console.log('Sync completed successfully');

      // Notify renderer process
      this.notifyRenderer('sync:completed');
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

  private async checkConnectivity(): Promise<boolean> {
    const config = getAppConfig();

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
