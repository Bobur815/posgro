import { ipcMain } from 'electron';
import { getPrismaClient } from '../database/sqlite-client';
import { getAppConfig } from '../config/app-config';
import { getServerToken } from '../sync/queue-manager';

interface MarkingCodeCheckResult {
  alreadySold: boolean;
  soldAt?: string;
  terminalId?: string;
  source?: 'local' | 'server';
}

interface MarkingCodeEntry {
  code: string;
  productBarcode?: string;
}

export function setupMarkingCodesHandlers(): void {
  // Check if a marking code has been sold (local SQLite first, then server)
  ipcMain.handle('markingCodes:check', async (_event, code: string): Promise<MarkingCodeCheckResult> => {
    const prisma = getPrismaClient();

    // 1. Check local SQLite
    const local = await (prisma as any).soldMarkingCode.findUnique({
      where: { code },
    });

    if (local) {
      return {
        alreadySold: true,
        soldAt: local.soldAt instanceof Date ? local.soldAt.toISOString() : String(local.soldAt),
        terminalId: local.terminalId,
        source: 'local',
      };
    }

    // 2. Check server (cross-terminal)
    const config = getAppConfig();
    const token = getServerToken();
    if (!token) return { alreadySold: false };

    try {
      const response = await fetch(
        `${config.vpsApiUrl}/marking-codes/check?code=${encodeURIComponent(code)}`,
        {
          headers: { Authorization: `Bearer ${token}` },
          signal: AbortSignal.timeout(4000),
        },
      );
      if (!response.ok) return { alreadySold: false };
      const result = await response.json();
      if (result.alreadySold) {
        return {
          alreadySold: true,
          soldAt: result.soldAt,
          terminalId: result.terminalId,
          source: 'server',
        };
      }
    } catch {
      // Server unreachable — allow sale (offline-first fallback)
    }

    return { alreadySold: false };
  });

  // Record marking codes as sold (called after sale completes)
  ipcMain.handle(
    'markingCodes:record',
    async (_event, entries: MarkingCodeEntry[]): Promise<void> => {
      if (!entries || entries.length === 0) return;

      const prisma = getPrismaClient();
      const config = getAppConfig();
      const terminalId = config.terminalId || 'unknown';
      const token = getServerToken();

      // 1. Write to local SQLite (best-effort, ignore conflicts)
      for (const entry of entries) {
        try {
          await (prisma as any).soldMarkingCode.upsert({
            where: { code: entry.code },
            create: {
              code: entry.code,
              productBarcode: entry.productBarcode ?? null,
              terminalId,
              synced: false,
            },
            update: {}, // already exists — don't overwrite
          });
        } catch {
          // ignore duplicate constraint errors
        }
      }

      // 2. Background sync to server
      if (!token) return;

      try {
        const response = await fetch(`${config.vpsApiUrl}/marking-codes/record`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            codes: entries.map((e) => ({
              code: e.code,
              productBarcode: e.productBarcode,
              soldAt: new Date().toISOString(),
            })),
            terminalId,
          }),
          signal: AbortSignal.timeout(8000),
        });

        if (response.ok) {
          // Mark as synced in local SQLite
          for (const entry of entries) {
            await (prisma as any).soldMarkingCode.updateMany({
              where: { code: entry.code },
              data: { synced: true },
            }).catch(() => {});
          }
        }
      } catch {
        // Will be picked up by future sync if needed
      }
    },
  );
}
