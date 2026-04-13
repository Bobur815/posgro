import { app, BrowserWindow, ipcMain } from "electron";
import { createWindow } from "./window";
import { setupIpcHandlers } from "./ipc/handlers";
import { SyncService } from "./sync/sync-service";
import { initializeDatabase } from "./database/sqlite-client";
import { seedLocalDatabase } from "./database/seed";
import { getAppConfig } from "./config/app-config";
import { getPrismaClient } from "./database/sqlite-client";
import { getServerToken } from "./sync/queue-manager";
import { getCurrentUser } from "./ipc/auth-handlers";

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
try {
  if (require("electron-squirrel-startup")) {
    app.quit();
  }
} catch {}

let mainWindow: BrowserWindow | null = null;
let syncService: SyncService | null = null;

async function bootstrap() {
  try {
    // Initialize local SQLite database
    await initializeDatabase();

    // Seed database with initial data if needed
    await seedLocalDatabase();

    // Create the main window
    mainWindow = createWindow();

    // Setup IPC handlers for renderer communication
    setupIpcHandlers();

    // Start sync service
    syncService = new SyncService();
    syncService.start();

    // Add this in your main process setup
    process.on("unhandledRejection", (reason, promise) => {
      console.error("Unhandled Rejection at:", promise, "reason:", reason);
    });

    process.on("uncaughtException", (error) => {
      console.error("Uncaught Exception:", error);
    });

    // Setup sync IPC handlers
    ipcMain.handle("sync:getStatus", () => {
      const config = getAppConfig();
      return {
        ...(syncService?.getStatus() ?? {
          isSyncing: false,
          lastSyncTime: null,
          lastError: null,
        }),
        vpsApiUrl: config.vpsApiUrl,
      };
    });

    ipcMain.handle("sync:trigger", async () => {
      await syncService?.triggerSync();
    });

    ipcMain.handle("sync:unbackfillStock", async () => {
      const config = getAppConfig();
      const token = getServerToken();
      if (!token) return { error: 'No server token — log in first' };
      const res = await fetch(`${config.vpsApiUrl}/sales/unbackfill-stock`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      });
      return res.json();
    });

    // Diagnostic endpoint — call from renderer devtools:
    //   window.electronAPI.invoke('sync:diagnose').then(console.log)
    ipcMain.handle("sync:diagnose", async () => {
      const config = getAppConfig();
      const prisma = getPrismaClient();
      const token = getServerToken();
      const currentUser = getCurrentUser();

      const [unsyncedCount, totalSales, localConfig, serverTokenSetting] = await Promise.all([
        prisma.sale.count({ where: { synced: false } }),
        prisma.sale.count(),
        prisma.localConfig.findUnique({ where: { id: 'config' } }),
        prisma.systemSetting.findUnique({ where: { key: 'server_token' } }),
      ]);

      // Check if persisted server token is still valid
      let persistedTokenExpiry: string | null = null;
      if (serverTokenSetting?.value) {
        try {
          const parts = serverTokenSetting.value.split('.');
          const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString()) as { exp?: number; role?: string; storeId?: string };
          persistedTokenExpiry = payload.exp
            ? new Date(payload.exp * 1000).toISOString()
            : 'no_expiry';
        } catch {
          persistedTokenExpiry = 'invalid_token';
        }
      }

      // Sample one unsynced sale for inspection
      const sampleUnsyncedSale = await prisma.sale.findFirst({
        where: { synced: false },
        include: { items: { take: 1 } },
        orderBy: { createdAt: 'desc' },
      });

      return {
        currentUser: currentUser ? { phone: currentUser.phone, role: currentUser.role } : null,
        serverToken: {
          inMemory: !!token,
          persisted: !!serverTokenSetting?.value,
          persistedExpiry: persistedTokenExpiry,
        },
        sales: {
          total: totalSales,
          unsynced: unsyncedCount,
          sampleUnsynced: sampleUnsyncedSale ? {
            id: sampleUnsyncedSale.id,
            receiptNumber: sampleUnsyncedSale.receiptNumber,
            cashierId: sampleUnsyncedSale.cashierId,
            cashierName: sampleUnsyncedSale.cashierName,
            createdAt: sampleUnsyncedSale.createdAt,
            itemCount: sampleUnsyncedSale.items.length,
          } : null,
        },
        config: {
          vpsApiUrl: config.vpsApiUrl,
          storeId: config.storeId,
          terminalId: config.terminalId,
          localConfigStoreId: localConfig?.storeId ?? null,
          localConfigApiUrl: localConfig?.apiUrl ?? null,
        },
        lastSalesSync: syncService?.getStatus().lastSalesSync ?? null,
      };
    });

  } catch (error) {
    console.error("Failed to start application:", error);
    app.quit();
  }
}

// App lifecycle events
app.whenReady().then(bootstrap);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    syncService?.stop();
    app.quit();
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    mainWindow = createWindow();
  }
});

// Handle app quit
app.on("before-quit", () => {
  syncService?.stop();
});

// Export for use in other modules
export { mainWindow };
