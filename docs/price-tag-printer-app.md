# Price Tag Printer — Standalone Electron App (Linux Mint)

A lightweight Electron app that connects to the VPS, fetches products, and prints
TSPL price tags on a label printer. No SQLite, no sync engine, no sales — only
the parts needed for price tag printing.

---

## Why a Separate App

The main grocery POS app is heavy (SQLite, sync engine, sales, suppliers, inventory).
Old hardware (Acer PC with 1–2 GB RAM) running Linux Mint struggles with it.
This standalone app contains only three moving parts:

```
Login → Fetch products from VPS → Print via TSPL printer
```

Total app size target: ~150 MB (Electron base) vs ~400 MB for the full POS.

---

## Architecture Overview

```
┌─────────────────────────────────────────┐
│  Renderer (React)                        │
│  - LoginPage                             │
│  - PriceTags.tsx     (template editor)   │
│  - PrintTagsModal.tsx (product selector) │
└────────────────┬────────────────────────┘
                 │ IPC (contextBridge)
┌────────────────▼────────────────────────┐
│  Main Process (Node.js)                  │
│  - auth: POST /api/auth/login            │
│  - products: GET /api/products           │
│  - printer: tspl-printer.ts (Linux)      │
└─────────────────────────────────────────┘
                 │ HTTP
┌────────────────▼────────────────────────┐
│  VPS (NestJS API)                        │
│  POST /api/auth/login → JWT              │
│  GET  /api/products   → product list     │
└─────────────────────────────────────────┘
```

---

## 1. Bootstrap the Project

```bash
mkdir price-tag-printer
cd price-tag-printer

npm init -y
npm install electron react react-dom
npm install -D typescript @types/react @types/react-dom
npm install -D vite @vitejs/plugin-react electron-builder
npm install styled-components react-i18next i18next
npm install -D @types/styled-components
```

### Recommended `package.json` scripts

```json
{
  "main": "dist/main/index.js",
  "scripts": {
    "dev": "concurrently \"vite\" \"electron .\"",
    "build": "vite build && tsc -p tsconfig.main.json",
    "dist": "npm run build && electron-builder"
  },
  "build": {
    "appId": "uz.bobur.price-tag-printer",
    "productName": "Price Tag Printer",
    "linux": {
      "target": ["AppImage", "deb"],
      "category": "Utility"
    },
    "files": ["dist/**/*"]
  }
}
```

---

## 2. Project Structure

```
price-tag-printer/
├── src/
│   ├── main/
│   │   ├── index.ts          ← Electron entry, IPC handlers
│   │   ├── preload.ts        ← contextBridge
│   │   └── printer/
│   │       └── tspl-printer.ts   ← ADAPTED for Linux (see section 5)
│   └── renderer/
│       ├── main.tsx          ← React entry
│       ├── App.tsx           ← Router: Login | PriceTags
│       ├── pages/
│       │   ├── LoginPage.tsx
│       │   └── Settings/
│       │       ├── PriceTags.tsx       ← copy from main project
│       │       └── PrintTagsModal.tsx  ← copy from main project
│       └── i18n/
│           └── locales/
│               ├── ru.json   ← only priceTags.* and common.* keys needed
│               └── uz.json
├── tsconfig.json
├── tsconfig.main.json
└── vite.config.ts
```

---

## 3. Files to Copy from the Main Project

Copy these files **as-is** (no modifications needed):

| Source (main project)                                      | Destination                          |
|------------------------------------------------------------|--------------------------------------|
| `src/renderer/pages/Settings/PriceTags.tsx`                | `src/renderer/pages/Settings/`       |
| `src/renderer/pages/Settings/PrintTagsModal.tsx`           | `src/renderer/pages/Settings/`       |
| `src/renderer/components/common/Modal.tsx`                 | `src/renderer/components/common/`    |
| `src/renderer/components/common/Button.tsx`                | `src/renderer/components/common/`    |
| `src/renderer/utils/helpers.ts`                            | `src/renderer/utils/`                |
| `src/shared/types/product.types.ts`                        | `src/shared/types/`                  |
| `src/shared/utils/barcode-parser.ts`                       | `src/shared/utils/`                  |

From the i18n locales, copy only these keys into the new `ru.json` / `uz.json`:
- `priceTags.*`
- `common.*`
- `printer.*`
- `scaleSettings.labelPrinterName`

---

## 4. Main Process — `src/main/index.ts`

```typescript
import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'path';
import { printPriceTagsTSPL } from './printer/tspl-printer';

let win: BrowserWindow | null = null;
let authToken: string | null = null;
let vpsApiUrl: string = '';

app.whenReady().then(() => {
  win = new BrowserWindow({
    width: 900,
    height: 700,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
    },
  });

  if (process.env.NODE_ENV === 'development') {
    win.loadURL('http://localhost:5173');
  } else {
    win.loadFile(path.join(__dirname, '../renderer/index.html'));
  }
});

// ── Auth ──────────────────────────────────────────────────────────────────────

ipcMain.handle('auth:login', async (_e, apiUrl: string, phone: string, password: string) => {
  const res = await fetch(`${apiUrl}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone, password }),
  });
  if (!res.ok) throw new Error('Login failed');
  const data = await res.json() as { token: string };
  authToken = data.token;
  vpsApiUrl = apiUrl;
  return { ok: true };
});

ipcMain.handle('auth:logout', () => {
  authToken = null;
});

// ── Products ──────────────────────────────────────────────────────────────────

ipcMain.handle('products:getAll', async () => {
  if (!authToken) throw new Error('Not authenticated');
  const res = await fetch(`${vpsApiUrl}/products?active=true`, {
    headers: { Authorization: `Bearer ${authToken}` },
  });
  if (!res.ok) throw new Error('Failed to fetch products');
  return res.json();
});

// ── Settings (localStorage-backed via renderer; stored in electron userData) ──

ipcMain.handle('settings:get', async (_e, key: string) => {
  // Stored in renderer localStorage — handled client-side.
  // For cross-session persistence use electron-store here if needed.
  return null;
});

// ── Printer ───────────────────────────────────────────────────────────────────

ipcMain.handle('printer:getAvailable', async () => {
  // On Linux, list printers via CUPS
  const { execSync } = await import('child_process');
  try {
    const output = execSync('lpstat -a 2>/dev/null || echo ""').toString();
    return output
      .split('\n')
      .filter(Boolean)
      .map((line) => line.split(' ')[0]);
  } catch {
    return [];
  }
});

ipcMain.handle('printer:printPriceTagsTSPL', async (_e, req) => {
  await printPriceTagsTSPL(req);
  return true;
});
```

---

## 5. TSPL Printer — Linux Adaptation

The main project's `tspl-printer.ts` uses PowerShell to send raw bytes to the printer
(Windows-only). On Linux, replace `sendRawToPrinter` with one of two methods:

### Method A — CUPS `lp` command (recommended, works with USB and network printers)

```typescript
import { execSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

function sendRawToPrinter(printerName: string, data: Buffer): void {
  const tmpFile = path.join(os.tmpdir(), `prtag_${Date.now()}.prn`);
  fs.writeFileSync(tmpFile, data);
  try {
    // -o raw tells CUPS not to filter the file — send bytes directly to printer
    execSync(`lp -d "${printerName}" -o raw "${tmpFile}"`, { stdio: 'pipe' });
  } finally {
    try { fs.unlinkSync(tmpFile); } catch {}
  }
}
```

### Method B — Direct TCP socket (for network label printers on port 9100)

```typescript
import net from 'net';

function sendRawToPrinterTCP(host: string, port = 9100, data: Buffer): Promise<void> {
  return new Promise((resolve, reject) => {
    const socket = new net.Socket();
    socket.connect(port, host, () => {
      socket.write(data, () => {
        socket.destroy();
        resolve();
      });
    });
    socket.on('error', reject);
    socket.setTimeout(5000, () => {
      socket.destroy();
      reject(new Error('Printer connection timeout'));
    });
  });
}
```

### How to swap

In `tspl-printer.ts`, find the `sendRawToPrinter` function and replace it with
Method A or B above. Everything else (`buildFullTSPL`, `buildOneLabelTSPL`,
`printPriceTagsTSPL`) stays the same.

**Keep the rest of `tspl-printer.ts` identical** — the TSPL command generation
logic is platform-independent.

---

## 6. Preload — `src/main/preload.ts`

```typescript
import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  auth: {
    login: (apiUrl: string, phone: string, password: string) =>
      ipcRenderer.invoke('auth:login', apiUrl, phone, password),
    logout: () => ipcRenderer.invoke('auth:logout'),
  },
  products: {
    getAll: (filters?: unknown) => ipcRenderer.invoke('products:getAll', filters),
  },
  settings: {
    get: (key: string) => ipcRenderer.invoke('settings:get', key),
    set: (key: string, value: string) => ipcRenderer.invoke('settings:set', key, value),
    getAll: () => ipcRenderer.invoke('settings:getAll'),
  },
  printer: {
    getAvailablePrinters: () => ipcRenderer.invoke('printer:getAvailable'),
    printPriceTagsTSPL: (req: unknown) => ipcRenderer.invoke('printer:printPriceTagsTSPL', req),
  },
});
```

---

## 7. Renderer — `src/renderer/App.tsx`

```tsx
import React, { useState } from 'react';
import { LoginPage } from './pages/LoginPage';
import { PriceTags } from './pages/Settings/PriceTags';

export function App() {
  const [loggedIn, setLoggedIn] = useState(false);

  if (!loggedIn) {
    return <LoginPage onSuccess={() => setLoggedIn(true)} />;
  }

  return <PriceTags />;
}
```

---

## 8. Login Page — `src/renderer/pages/LoginPage.tsx`

```tsx
import React, { useState } from 'react';

interface Props { onSuccess: () => void; }

export function LoginPage({ onSuccess }: Props) {
  const [apiUrl, setApiUrl] = useState('https://your-vps.com/api');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleLogin = async () => {
    try {
      await window.electronAPI.auth.login(apiUrl, phone, password);
      onSuccess();
    } catch {
      setError('Login failed. Check credentials and VPS URL.');
    }
  };

  return (
    <div style={{ maxWidth: 360, margin: '80px auto', padding: 24 }}>
      <h2>Price Tag Printer</h2>
      <input placeholder="VPS API URL" value={apiUrl}
        onChange={e => setApiUrl(e.target.value)} style={{ width: '100%', marginBottom: 8 }} />
      <input placeholder="Phone" value={phone}
        onChange={e => setPhone(e.target.value)} style={{ width: '100%', marginBottom: 8 }} />
      <input type="password" placeholder="Password" value={password}
        onChange={e => setPassword(e.target.value)} style={{ width: '100%', marginBottom: 8 }} />
      {error && <p style={{ color: 'red' }}>{error}</p>}
      <button onClick={handleLogin} style={{ width: '100%' }}>Login</button>
    </div>
  );
}
```

---

## 9. PriceTags.tsx Compatibility Shim

`PriceTags.tsx` and `PrintTagsModal.tsx` call `window.electronAPI.products.getAll()`.
The preload above already exposes this. One small difference: the main POS uses
`useNavigate` (react-router). In the standalone app there is no router, so replace
the back button in `PriceTags.tsx`:

```tsx
// Replace:
const navigate = useNavigate();
// ...
<BackButton onClick={() => navigate('/settings')}>

// With:
<BackButton onClick={() => setEditing(null)}>
```

Or wrap the app with a `MemoryRouter` from `react-router-dom` — either works.

---

## 10. Linux Printer Setup

### Install CUPS

```bash
sudo apt install cups
sudo usermod -aG lpadmin $USER
# Open CUPS web UI to add printer:
# http://localhost:631
```

### Add a USB label printer (e.g., XP-365B)

```bash
# Find the printer URI
lpinfo -v | grep usb

# Add it (replace URI with your value)
sudo lpadmin -p XP365B -E -v usb://XP/365B -m raw
sudo lpoptions -d XP365B
```

### Test raw printing

```bash
echo -e "SIZE 40 mm, 30 mm\nGAP 3 mm, 0 mm\nCLS\nTEXT 10,10,\"3\",0,1,1,\"TEST\"\nPRINT 1,1\r\n" | lp -d XP365B -o raw
```

---

## 11. Build & Distribute

### Development

```bash
npm run dev
```

### Production build (AppImage — runs on any Linux without install)

```bash
npm run dist
# Output: dist/Price Tag Printer-1.0.0.AppImage
```

### Install on the old Acer PC

```bash
chmod +x "Price Tag Printer-1.0.0.AppImage"
./Price Tag Printer-1.0.0.AppImage
```

Or build a `.deb` and install with:
```bash
sudo dpkg -i price-tag-printer_1.0.0_amd64.deb
```

---

## 12. Minimum System Requirements

| Component | Minimum          |
|-----------|------------------|
| OS        | Ubuntu 18.04 / Linux Mint 19+ (64-bit) |
| RAM       | 512 MB free      |
| CPU       | Any dual-core x86_64 |
| Disk      | 300 MB           |
| Network   | WiFi or LAN (to reach VPS) |
| Printer   | USB or network TSPL label printer |

---

## 13. What to Remove vs Keep

| Feature          | Keep? | Reason                          |
|------------------|-------|---------------------------------|
| PriceTags.tsx    | ✅    | Core feature                    |
| PrintTagsModal.tsx | ✅  | Core feature                    |
| tspl-printer.ts  | ✅    | Adapted for Linux               |
| SQLite / Prisma  | ❌    | No local DB needed              |
| SyncService      | ❌    | Products fetched live from VPS  |
| Sales / Cart     | ❌    | Not needed                      |
| Inventory        | ❌    | Not needed                      |
| Suppliers        | ❌    | Not needed                      |
| Barcode scanner  | ❌    | Not needed for price tags       |
| Scale integration | ❌   | Not needed                      |
| Template storage | ✅    | Use `localStorage` or `electron-store` |
