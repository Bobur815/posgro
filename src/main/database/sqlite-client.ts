import { PrismaClient } from '@prisma/client';
import path from 'path';
import { app } from 'electron';

let prisma: PrismaClient | null = null;

export function getPrismaClient(): PrismaClient {
  if (!prisma) {
    throw new Error('Database not initialized. Call initializeDatabase() first.');
  }
  return prisma;
}

export async function initializeDatabase(): Promise<void> {
  // Get the user data path for the database file
  const userDataPath = app.getPath('userData');
  const dbPath = path.join(userDataPath, 'pos-local.db');

  // Set environment variable for Prisma
  process.env.DATABASE_URL = `file:${dbPath}`;
  process.env.DATABASE_PROVIDER = 'sqlite';

  // Initialize Prisma client
  prisma = new PrismaClient({
    datasources: {
      db: {
        url: `file:${dbPath}`,
      },
    },
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  });

  // Test connection
  try {
    await prisma.$connect();
    console.log(`Database connected: ${dbPath}`);
  } catch (error) {
    console.error('Failed to connect to database:', error);
    throw error;
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
