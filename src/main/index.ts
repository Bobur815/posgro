import { app, BrowserWindow } from 'electron';
import { createWindow } from './window';
import { setupIpcHandlers } from './ipc/handlers';
import { SyncService } from './sync/sync-service';
import { initializeDatabase } from './database/sqlite-client';

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (require('electron-squirrel-startup')) {
  app.quit();
}

let mainWindow: BrowserWindow | null = null;
let syncService: SyncService | null = null;

async function bootstrap() {
  try {
    // Initialize local SQLite database
    await initializeDatabase();
    console.log('Database initialized');

    // Create the main window
    mainWindow = createWindow();

    // Setup IPC handlers for renderer communication
    setupIpcHandlers();

    // Start sync service
    syncService = new SyncService();
    syncService.start();

    console.log('Application started successfully');
  } catch (error) {
    console.error('Failed to start application:', error);
    app.quit();
  }
}

// App lifecycle events
app.whenReady().then(bootstrap);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    syncService?.stop();
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    mainWindow = createWindow();
  }
});

// Handle app quit
app.on('before-quit', () => {
  syncService?.stop();
});

// Export for use in other modules
export { mainWindow };
