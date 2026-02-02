import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import { app } from 'electron';

const execAsync = promisify(exec);

export async function runMigrations(): Promise<void> {
  const userDataPath = app.getPath('userData');
  const dbPath = path.join(userDataPath, 'pos-local.db');

  // Set environment variables for Prisma CLI
  const env = {
    ...process.env,
    DATABASE_URL: `file:${dbPath}`,
    DATABASE_PROVIDER: 'sqlite',
  };

  try {
    console.log('Running database migrations...');

    // Run Prisma migrate deploy
    const { stdout, stderr } = await execAsync('npx prisma migrate deploy', {
      env,
      cwd: app.getAppPath(),
    });

    if (stdout) {
      console.log('Migration output:', stdout);
    }

    if (stderr) {
      console.warn('Migration warnings:', stderr);
    }

    console.log('Migrations completed successfully');
  } catch (error) {
    console.error('Migration failed:', error);
    throw error;
  }
}

export async function resetDatabase(): Promise<void> {
  const userDataPath = app.getPath('userData');
  const dbPath = path.join(userDataPath, 'pos-local.db');

  const env = {
    ...process.env,
    DATABASE_URL: `file:${dbPath}`,
    DATABASE_PROVIDER: 'sqlite',
  };

  try {
    console.log('Resetting database...');

    // Run Prisma migrate reset (WARNING: This deletes all data!)
    const { stdout, stderr } = await execAsync('npx prisma migrate reset --force', {
      env,
      cwd: app.getAppPath(),
    });

    if (stdout) {
      console.log('Reset output:', stdout);
    }

    if (stderr) {
      console.warn('Reset warnings:', stderr);
    }

    console.log('Database reset completed');
  } catch (error) {
    console.error('Database reset failed:', error);
    throw error;
  }
}
