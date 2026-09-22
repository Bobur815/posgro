import { ipcMain, BrowserWindow } from 'electron';
import { autoUpdater, UpdateInfo, ProgressInfo, CancellationToken } from 'electron-updater';
import { log } from '../logger';

let activeCancellationToken: CancellationToken | null = null;

export function setupAutoUpdater(mainWindow: BrowserWindow): void {
  autoUpdater.setFeedURL({
    provider: 'generic',
    url: 'https://pos.bobur-dev.uz/releases/',
    channel: 'latest',
  });
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;
  // Into the app's own log, which tills upload: whether a download was differential (blockmap) or
  // the whole installer, and why an update failed, are otherwise invisible.
  autoUpdater.logger = log;

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
    activeCancellationToken = new CancellationToken();
    try {
      await autoUpdater.downloadUpdate(activeCancellationToken);
    } catch (err) {
      const message = (err as Error).message;
      if (message === 'cancelled') {
        send('updater:cancelled');
      } else {
        send('updater:error', { message });
      }
    } finally {
      activeCancellationToken = null;
    }
  });

  ipcMain.handle('updater:cancelDownload', () => {
    activeCancellationToken?.cancel();
    activeCancellationToken = null;
  });

  ipcMain.handle('updater:quitAndInstall', () => {
    // Give the renderer a moment to paint its "installing" overlay before the window is destroyed,
    // then install silently and start the app again (isSilent, isForceRunAfter). With the app one
    // archive instead of ~24,000 files the install takes seconds, and a silent update keeps the
    // folder the shop first installed to — no wizard for a cashier to click through.
    setTimeout(() => {
      // Destroy the window directly to bypass the close-confirmation interceptor.
      mainWindow.destroy();
      autoUpdater.quitAndInstall(true, true);
    }, 600);
  });
}
