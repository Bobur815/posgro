import { app, BrowserWindow, ipcMain } from "electron";
import { createWindow } from "./window";
import { setupIpcHandlers } from "./ipc/handlers";
import { SyncService } from "./sync/sync-service";
import { initializeDatabase } from "./database/sqlite-client";
import { seedLocalDatabase } from "./database/seed";
import { getAppConfig } from "./config/app-config";

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
    console.log("Database initialized");

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

    console.log("Application started successfully");
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
