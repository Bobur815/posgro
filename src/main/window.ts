import { BrowserWindow, screen, Menu, globalShortcut, ipcMain, app } from "electron";
import path from "path";

const iconPath = app.isPackaged
  ? path.join(process.resourcesPath, "icons", "posgro-icon.ico")
  : path.join(__dirname, "../../build/icons/posgro-icon.ico");

export function createSetupWindow(): BrowserWindow {
  const setupWindow = new BrowserWindow({
    width: 920,
    height: 680,
    center: true,
    resizable: false,
    maximizable: false,
    webPreferences: {
      preload: path.join(__dirname, "../preload/preload.js"),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
    },
    show: false,
    title: "POSGRO",
    icon: iconPath,
    autoHideMenuBar: true,
  });
  
  setupWindow.once("ready-to-show", () => {
    setupWindow.show();
    setupWindow.focus();
  });

  globalShortcut.register("CommandOrControl+Shift+I", () => {
    if (!setupWindow.isDestroyed()) setupWindow.webContents.toggleDevTools();
  });

  setupWindow.on("closed", () => {
    globalShortcut.unregister("CommandOrControl+Shift+I");
  });

  if (process.env.NODE_ENV === "development") {
    setupWindow.loadURL("http://localhost:5400/#/setup");
  } else {
    setupWindow.loadFile(
      path.join(__dirname, "../../dist-renderer/index.html"),
      { hash: "setup" },
    );
  }

  setupWindow.webContents.on("did-fail-load", (_e, code, desc, url) => {
    console.error(
      `[SetupWindow] did-fail-load: code=${code} desc=${desc} url=${url}`,
    );
  });

  return setupWindow;
}

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
      preload: path.join(__dirname, "../preload/preload.js"),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
    },
    show: false,
    title: "POSGRO",
    icon: iconPath,
    autoHideMenuBar: true, // Hide menu bar
  });
  // Show window when ready
  mainWindow.once("ready-to-show", () => {
    mainWindow.maximize(); // Remove space around window
    mainWindow.setBounds({ x: 0, y: 0, width, height }); // Cover taskbar
    mainWindow.show();
    mainWindow.focus();
  });

  // Register devtools shortcut
  globalShortcut.register("CommandOrControl+Shift+I", () => {
    mainWindow.webContents.toggleDevTools();
  });

  mainWindow.on("closed", () => {
    globalShortcut.unregister("CommandOrControl+Shift+I");
  });

  // Load the app
  if (process.env.NODE_ENV === "development") {
    // Development: load from Vite dev server
    mainWindow.loadURL("http://localhost:5400");
  } else {
    // Production: load from built files
    mainWindow.loadFile(path.join(__dirname, "../../dist-renderer/index.html"));
  }

  mainWindow.webContents.on("did-fail-load", (_e, code, desc, url) => {
    console.error(
      `[Window] did-fail-load: code=${code} desc=${desc} url=${url}`,
    );
  });

  // Intercept close to show confirmation in renderer
  mainWindow.on("close", (e) => {
    e.preventDefault();
    mainWindow.webContents.send("app:close-requested");
  });

  // Confirm close from renderer — destroy window (bypasses close event)
  const onConfirmClose = () => mainWindow.destroy();
  ipcMain.on("app:confirm-close", onConfirmClose);
  mainWindow.on("closed", () =>
    ipcMain.removeListener("app:confirm-close", onConfirmClose),
  );

  return mainWindow;
}
