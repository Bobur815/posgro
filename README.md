# Grocery Store POS System

A modern, offline-first Point of Sale (POS) system designed for grocery stores.

## Features

- Offline-first operation (works without internet)
- Barcode scanning support
- Receipt printing
- Real-time inventory tracking
- Sales analytics & reports
- Multi-terminal support
- Role-based access control (Admin/User)
- Automatic data synchronization
- Remote management via Telegram
- Multi-language support (Russian & Uzbek)
- Dark/Light theme support

## Tech Stack

### Backend (VPS)
- Node.js 20+
- NestJS 10+
- PostgreSQL 15
- Prisma ORM

### Frontend/Desktop (POS)
- Electron 28+
- React 18+
- TypeScript 5+
- SQLite (better-sqlite3)
- Zustand (State Management)
- Styled Components

## Getting Started

### Prerequisites

- Node.js 20+
- npm or pnpm
- Git
- PostgreSQL 15+ (for VPS development)

### Installation

```bash
# Clone repository
git clone https://github.com/your-username/grocery-pos.git
cd grocery-pos

# Install dependencies
npm install

# Setup environment
cp .env.example .env.pos
cp .env.example .env.server

# Generate Prisma client
npm run prisma:generate

# Run migrations
npm run prisma:migrate:dev

# Seed database
npm run prisma:seed
```

### Development

```bash
# Run VPS Backend (NestJS)
npm run dev:server

# Run POS Frontend (Electron)
npm run dev:pos
```

### Building

```bash
# Build POS Desktop App
npm run build:pos

# Build VPS Backend
npm run build:server
```

## Production Build Notes

### Environment Variables
Edit `.env.pos` before building — values are baked into the bundle at build time (not read at runtime):

| Variable | Description |
|---|---|
| `STORE_ID` | Store identifier on the server |
| `TERMINAL_ID` | Unique terminal ID (e.g. `T1`, `T2`) |
| `VPS_API_URL` | Backend API URL |
| `JWT_SECRET` | Secret key for local auth tokens |
| `STORE_NAME` | Initial store name (also configurable in app Settings) |

### Packaging
The installer is built with `electron-builder` (NSIS for Windows). Key decisions:

- **`asar: false`** — disabled asar packaging because Chromium's ES module loader cannot read from `.asar` virtual filesystems. Files are installed as plain directories under `resources/app/`.
- **`HashRouter`** — React Router uses `HashRouter` instead of `BrowserRouter` because `BrowserRouter` navigates to `file:///C:/` on `file://` protocol, breaking the app.
- **Prisma client** — included via `files: ['src/generated/prisma-sqlite/**/*']`. The native `.node` query engine is in a plain directory so `require()` loads it correctly.
- **Static images** — placed in `public/images/` so Vite copies them to `dist-renderer/images/` during build.
- **Receipt printer** — configure paper size to `58×297mm` in Windows → Devices and Printers → XP-58 → Printing Preferences. Printer name is saved via app Settings → Printer Settings.

## Documentation

See [GROCERY_POS_DOCUMENTATION.md](./GROCERY_POS_DOCUMENTATION.md) for complete documentation.

## License

Proprietary - All rights reserved.
