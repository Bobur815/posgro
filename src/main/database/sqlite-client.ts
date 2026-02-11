// Use the SQLite-specific Prisma client
import path from 'path';
import { app } from 'electron';
import fs from 'fs';

// Resolve prisma client path relative to app root
const prismaClientPath = path.join(app.getAppPath(), 'src', 'generated', 'prisma-sqlite');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { PrismaClient } = require(prismaClientPath);

type PrismaClientType = InstanceType<typeof PrismaClient>;

let prisma: PrismaClientType | null = null;

export function getPrismaClient(): PrismaClientType {
  if (!prisma) {
    throw new Error('Database not initialized. Call initializeDatabase() first.');
  }
  return prisma;
}

export async function initializeDatabase(): Promise<void> {
  // Get the user data path for the database file
  const userDataPath = app.getPath('userData');
  const dbPath = path.join(userDataPath, 'pos-local.db');

  // Ensure directory exists
  const dbDir = path.dirname(dbPath);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  console.log(`Initializing database at: ${dbPath}`);

  // Set environment variable for Prisma
  process.env.DATABASE_URL = `file:${dbPath}`;

  // Initialize Prisma client
  prisma = new PrismaClient({
    datasources: {
      db: {
        url: `file:${dbPath}`,
      },
    },
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  });

  // Test connection and create schema
  try {
    await prisma.$connect();
    console.log(`Database connected: ${dbPath}`);

    // Create tables if they don't exist
    await createSchemaIfNeeded(prisma);

    // Run migrations for existing databases
    await runMigrations(prisma);
  } catch (error) {
    console.error('Failed to connect to database:', error);
    throw error;
  }
}

async function createSchemaIfNeeded(prisma: PrismaClientType): Promise<void> {
  // Check if tables exist by trying to query one
  try {
    await prisma.$queryRaw`SELECT 1 FROM local_config LIMIT 1`;
    return; // Tables already exist
  } catch {
    console.log('Creating database schema...');
  }

  // Create all tables with updated schema
  await prisma.$executeRaw`
    CREATE TABLE IF NOT EXISTS local_config (
      id TEXT PRIMARY KEY DEFAULT 'config',
      store_id TEXT NOT NULL,
      store_name TEXT NOT NULL,
      terminal_id TEXT NOT NULL,
      api_url TEXT NOT NULL,
      store_pin TEXT,
      last_sync DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `;

  await prisma.$executeRaw`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      phone TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      role TEXT DEFAULT 'USER',
      name_uz TEXT NOT NULL,
      name_ru TEXT NOT NULL,
      active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `;

  await prisma.$executeRaw`
    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name_uz TEXT NOT NULL,
      name_ru TEXT NOT NULL,
      active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `;

  await prisma.$executeRaw`
    CREATE TABLE IF NOT EXISTS suppliers (
      id TEXT PRIMARY KEY,
      name_uz TEXT NOT NULL,
      name_ru TEXT NOT NULL,
      phone TEXT,
      address TEXT,
      active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `;

  // UPDATED PRODUCTS TABLE WITH NEW FIELDS
  await prisma.$executeRaw`
    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      barcode TEXT UNIQUE NOT NULL,
      name_uz TEXT NOT NULL,
      name_ru TEXT NOT NULL,
      price REAL NOT NULL,
      cost REAL,
      stock REAL DEFAULT 0,
      min_stock REAL DEFAULT 0,
      unit TEXT DEFAULT 'шт',
      category_id INTEGER NOT NULL,
      supplier_id TEXT,
      expiry_date DATETIME,
      discount_percent REAL DEFAULT 0,
      is_on_promotion INTEGER DEFAULT 0,
      pending_price REAL,
      pending_price_threshold REAL,
      active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (category_id) REFERENCES categories(id),
      FOREIGN KEY (supplier_id) REFERENCES suppliers(id)
    )
  `;

  await prisma.$executeRaw`
    CREATE TABLE IF NOT EXISTS sales (
      id TEXT PRIMARY KEY,
      receipt_number TEXT UNIQUE NOT NULL,
      total_amount REAL NOT NULL,
      discount_amount REAL DEFAULT 0,
      final_amount REAL NOT NULL,
      payment_method TEXT NOT NULL,
      cashier_id TEXT NOT NULL,
      cashier_name TEXT NOT NULL,
      terminal_id TEXT NOT NULL,
      synced INTEGER DEFAULT 0,
      synced_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `;

  await prisma.$executeRaw`
    CREATE TABLE IF NOT EXISTS sale_items (
      id TEXT PRIMARY KEY,
      sale_id TEXT NOT NULL,
      product_id INTEGER NOT NULL,
      product_name TEXT NOT NULL,
      barcode TEXT NOT NULL,
      quantity REAL NOT NULL,
      unit_price REAL NOT NULL,
      subtotal REAL NOT NULL,
      FOREIGN KEY (sale_id) REFERENCES sales(id) ON DELETE CASCADE,
      FOREIGN KEY (product_id) REFERENCES products(id)
    )
  `;

  await prisma.$executeRaw`
    CREATE TABLE IF NOT EXISTS system_settings (
      id TEXT PRIMARY KEY,
      key TEXT UNIQUE NOT NULL,
      value TEXT NOT NULL,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `;

  await prisma.$executeRaw`
    CREATE TABLE IF NOT EXISTS inventory_arrivals (
      id TEXT PRIMARY KEY,
      product_id INTEGER NOT NULL,
      quantity REAL NOT NULL,
      cost REAL NOT NULL,
      total_cost REAL NOT NULL,
      supplier_id TEXT,
      notes TEXT,
      created_by TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (product_id) REFERENCES products(id),
      FOREIGN KEY (supplier_id) REFERENCES suppliers(id)
    )
  `;

  await prisma.$executeRaw`
    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      phone TEXT NOT NULL,
      action TEXT NOT NULL,
      entity TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      details TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `;

  await prisma.$executeRaw`
    CREATE TABLE IF NOT EXISTS sync_queue (
      id TEXT PRIMARY KEY,
      entity TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      action TEXT NOT NULL,
      payload TEXT NOT NULL,
      attempts INTEGER DEFAULT 0,
      last_error TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `;

  // Create indexes
  await prisma.$executeRaw`CREATE INDEX IF NOT EXISTS idx_products_barcode ON products(barcode)`;
  await prisma.$executeRaw`CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id)`;
  await prisma.$executeRaw`CREATE INDEX IF NOT EXISTS idx_products_supplier ON products(supplier_id)`;
  await prisma.$executeRaw`CREATE INDEX IF NOT EXISTS idx_products_expiry ON products(expiry_date)`;
  await prisma.$executeRaw`CREATE INDEX IF NOT EXISTS idx_products_promotion ON products(is_on_promotion)`;
  await prisma.$executeRaw`CREATE INDEX IF NOT EXISTS idx_sales_synced ON sales(synced)`;
  await prisma.$executeRaw`CREATE INDEX IF NOT EXISTS idx_sales_created ON sales(created_at)`;
  await prisma.$executeRaw`CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON audit_logs(user_id)`;
  await prisma.$executeRaw`CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action)`;
  await prisma.$executeRaw`CREATE INDEX IF NOT EXISTS idx_sync_queue_entity ON sync_queue(entity)`;

  console.log('Database schema created');
}

async function runMigrations(prisma: PrismaClientType): Promise<void> {
  // Migration 1: Add store_pin column to local_config table if it doesn't exist
  try {
    await prisma.$queryRaw`SELECT store_pin FROM local_config LIMIT 1`;
  } catch {
    console.log('Running migration: Adding store_pin column to local_config table...');
    await prisma.$executeRaw`ALTER TABLE local_config ADD COLUMN store_pin TEXT`;
    console.log('Migration completed: store_pin column added');
  }

  // Migration 2: Add new product fields if they don't exist
  try {
    await prisma.$queryRaw`SELECT supplier_id FROM products LIMIT 1`;
  } catch {
    console.log('Running migration: Adding new product fields...');
    await prisma.$executeRaw`ALTER TABLE products ADD COLUMN supplier_id TEXT`;
    await prisma.$executeRaw`ALTER TABLE products ADD COLUMN expiry_date DATETIME`;
    await prisma.$executeRaw`ALTER TABLE products ADD COLUMN discount_percent REAL DEFAULT 0`;
    await prisma.$executeRaw`ALTER TABLE products ADD COLUMN is_on_promotion INTEGER DEFAULT 0`;
    console.log('Migration completed: New product fields added');
  }

  // Migration 3: Add pending price fields for deferred price changes
  try {
    await prisma.$queryRaw`SELECT pending_price FROM products LIMIT 1`;
  } catch {
    console.log('Running migration: Adding pending price fields...');
    await prisma.$executeRaw`ALTER TABLE products ADD COLUMN pending_price REAL`;
    await prisma.$executeRaw`ALTER TABLE products ADD COLUMN pending_price_threshold REAL`;
    console.log('Migration completed: Pending price fields added');
  }
}

export async function closeDatabase(): Promise<void> {
  if (prisma) {
    await prisma.$disconnect();
    prisma = null;
    console.log('Database connection closed');
  }
}

// Export prisma instance for direct use
export { prisma };
