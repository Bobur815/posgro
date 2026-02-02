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

## Documentation

See [GROCERY_POS_DOCUMENTATION.md](./GROCERY_POS_DOCUMENTATION.md) for complete documentation.

## License

Proprietary - All rights reserved.
