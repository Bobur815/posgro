// Encrypted secret storage for the REGOS:VCR cassir password.
// Uses Electron safeStorage (OS keychain / DPAPI on Windows). The encrypted blob
// is persisted as base64 in system_settings so it travels with the per-store DB.

import { safeStorage } from 'electron';
import { getPrismaClient } from '../database/sqlite-client';

const KEY = 'regos_vcr_password_enc';
// Marks a value stored without OS encryption (fallback when safeStorage is unavailable).
const PLAIN_PREFIX = 'plain:';

export async function setVcrPassword(password: string): Promise<void> {
  const prisma = getPrismaClient();
  let stored: string;
  if (safeStorage.isEncryptionAvailable()) {
    stored = safeStorage.encryptString(password).toString('base64');
  } else {
    console.warn('[fiscal] safeStorage unavailable — storing VCR password unencrypted');
    stored = PLAIN_PREFIX + Buffer.from(password, 'utf-8').toString('base64');
  }
  await prisma.systemSetting.upsert({
    where: { key: KEY },
    update: { value: stored },
    create: { key: KEY, value: stored },
  });
}

export async function getVcrPassword(): Promise<string | null> {
  const prisma = getPrismaClient();
  const row = await prisma.systemSetting.findUnique({ where: { key: KEY } });
  if (!row?.value) return null;
  try {
    if (row.value.startsWith(PLAIN_PREFIX)) {
      return Buffer.from(row.value.slice(PLAIN_PREFIX.length), 'base64').toString('utf-8');
    }
    return safeStorage.decryptString(Buffer.from(row.value, 'base64'));
  } catch (e) {
    console.error('[fiscal] failed to decrypt VCR password:', e instanceof Error ? e.message : e);
    return null;
  }
}

export async function hasVcrPassword(): Promise<boolean> {
  const prisma = getPrismaClient();
  const row = await prisma.systemSetting.findUnique({ where: { key: KEY } });
  return Boolean(row?.value);
}
