import { BrowserWindow, screen, Menu, globalShortcut } from 'electron';
import path from 'path';

export function createWindow(): BrowserWindow {
  // Get full primary display size (including taskbar area)
  const { width, height } = screen.getPrimaryDisplay().bounds;

  // Remove default menu bar (File, Edit, View, etc.)
  Menu.setApplicationMenu(null);

  // Create the browser window at full screen size
  const mainWindow = new BrowserWindow({
    x: 0,
    y: 0,
    width,
    height,
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
    },
    show: false,
    title: 'Grocery POS',
    icon: path.join(__dirname, '../../build/icon.ico'),
    autoHideMenuBar: true, // Hide menu bar
  });

  // Show window when ready
  mainWindow.once('ready-to-show', () => {
    mainWindow.maximize(); // Remove space around window
    mainWindow.setBounds({ x: 0, y: 0, width, height }); // Cover taskbar
    mainWindow.setMaximizable(false);
    mainWindow.setResizable(false);
    mainWindow.show();
    mainWindow.focus();
  });

  // Register devtools shortcut in development
  if (process.env.NODE_ENV === 'development') {
    globalShortcut.register('CommandOrControl+Shift+I', () => {
      mainWindow.webContents.toggleDevTools();
    });

    mainWindow.on('closed', () => {
      globalShortcut.unregister('CommandOrControl+Shift+I');
    });
  }

  // Load the app
  if (process.env.NODE_ENV === 'development') {
    // Development: load from Vite dev server
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    // Production: load from built files
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  // Handle window close
  mainWindow.on('closed', () => {
    // Dereference the window object
  });

  return mainWindow;
}
