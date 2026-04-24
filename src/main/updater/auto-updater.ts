import { ipcMain, BrowserWindow } from 'electron';
import { autoUpdater, UpdateInfo, ProgressInfo } from 'electron-updater';

export function setupAutoUpdater(mainWindow: BrowserWindow): void {
  autoUpdater.setFeedURL({
    provider: 'generic',
    url: 'https://pos.bobur-dev.uz/releases/',
    channel: 'latest',
  });
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;

  const send = (channel: string, data?: unknown) => {
    if (!mainWindow.isDestroyed()) {
      mainWindow.webContents.send(channel, data);
    }
  };

  autoUpdater.on('checking-for-update', () => {
    send('updater:checking');
  });

  autoUpdater.on('update-available', (info: UpdateInfo) => {
    send('updater:available', { version: info.version, releaseDate: info.releaseDate });
  });

  autoUpdater.on('update-not-available', () => {
    send('updater:not-available');
  });

  autoUpdater.on('download-progress', (progress: ProgressInfo) => {
    send('updater:progress', {
      percent: progress.percent,
      transferred: progress.transferred,
      total: progress.total,
      bytesPerSecond: progress.bytesPerSecond,
    });
  });

  autoUpdater.on('update-downloaded', (info: UpdateInfo) => {
    send('updater:downloaded', { version: info.version });
  });

  autoUpdater.on('error', (err: Error) => {
    send('updater:error', { message: err.message });
  });

  ipcMain.handle('updater:checkForUpdates', async () => {
    try {
      await autoUpdater.checkForUpdates();
    } catch (err) {
      send('updater:error', { message: (err as Error).message });
    }
  });

  ipcMain.handle('updater:startDownload', async () => {
    try {
      await autoUpdater.downloadUpdate();
    } catch (err) {
      send('updater:error', { message: (err as Error).message });
    }
  });

  ipcMain.handle('updater:quitAndInstall', () => {
    autoUpdater.quitAndInstall();
  });
}
