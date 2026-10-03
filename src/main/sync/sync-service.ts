import { BrowserWindow } from 'electron';
import { syncSales, SalesSyncResult } from './sales-sync';
import { syncSmenas } from './smena-sync';
import {
  syncProducts,
  syncCategories,
  syncSuppliers,
  syncUsers,
  syncSettings,
  syncDeletedProducts,
} from './products-sync';
import { getCurrentUser } from '../ipc/auth-handlers';
import { uploadLocalData, uploadNasiya } from './upload-sync';
import { pullDebtLedger } from './debt-ledger-sync';
import { syncFiscalStatus } from './fiscal-status-sync';
import { syncSalePayments } from './payments-sync';
import { getAppConfig } from '../config/app-config';
import { getPrismaClient } from '../database/sqlite-client';
import { getServerToken, clearServerToken } from './queue-manager';
import { shouldUploadMasterData, syncTarget } from './sync-policy';
import { syncWithMain } from '../lan/main-sync';
import { MainLinkError } from '../lan/main-link';
import { flushLogs } from '../logger';
import { isWriteFrozen } from '../sales/write-freeze';
import { pullStoreConfig } from './store-config';

function decodeTokenStoreId(token: string): string | null | undefined {
  try {
    const parts = token.split('.');
    const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString()) as { storeId?: string | null; exp?: number };
    if (payload.exp && payload.exp * 1000 <= Date.now()) return undefined;
    return payload.storeId ?? null;
  } catch {
    return undefined;
  }
}

/**
 * True when the JWT says it has expired. An unreadable token is left alone — the store guard
 * below decides that case, and guessing here would throw away a token that may be fine.
 */
function isTokenExpired(token: string): boolean {
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString()) as { exp?: number };
    return !!payload.exp && payload.exp * 1000 <= Date.now();
  } catch {
    return false;
  }
}

/** How long the Sync button waits for a running cycle before reporting "busy". */
const NASIYA_WAIT_MS = 60_000;

export type NasiyaSyncResult =
  | { ok: true; at: string }
  | { ok: false; reason: 'busy' | 'not_applicable' | 'no_token' | 'offline' | 'error' };

export class SyncService {
  private syncInterval: NodeJS.Timeout | null = null;
  private isSyncing = false;
  private lastSyncTime: Date | null = null;
  private lastError: string | null = null;
  private lastSalesSync: SalesSyncResult | null = null;

  start(): void {

    // Initial sync after a short delay (faster in dev/local mode)
    const config = getAppConfig();
    const isLocal = config.vpsApiUrl.includes('localhost') || config.vpsApiUrl.includes('127.0.0.1');
    setTimeout(() => {
      this.sync();
    }, isLocal ? 1000 : 5000);

    // Periodic sync
    this.syncInterval = setInterval(() => {
      this.sync();
    }, config.syncIntervalMs);
  }

  stop(): void {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
  }

  async sync(): Promise<void> {
    if (this.isSyncing) {
      return;
    }
    // Handing the main role over (§11.4): what this cycle would write here — pulled products,
    // "uploaded" marks — would land after the new main's copy was taken. The new main syncs it.
    if (isWriteFrozen()) {
      return;
    }

    this.isSyncing = true;
    this.lastError = null;

    try {
      const prisma = getPrismaClient();
      const localConfig = await prisma.localConfig.findUnique({ where: { id: 'config' } });

      // An OFFLINE_ONLY main's SQLite is the source of truth and it has no server to sync with; a
      // satellite's server is its main, in either mode, and never the VPS (LAN plan §1). Checked
      // here rather than in start() so a mode or role learned after launch takes effect at once.
      const target = syncTarget(localConfig);
      if (target === 'none') {
        return;
      }
      if (target === 'main') {
        await this.syncWithMainTerminal();
        return;
      }

      // Guard: verify the server token is scoped to this terminal's store
      const token = getServerToken();
      if (!token) {
        // Nobody has signed in with a password on this terminal since the last token expired.
        // A PIN login cannot mint one, so a cashier-only terminal reaches this state on its own
        // and would otherwise go quiet for a whole shift — say so instead of returning silently.
        await this.reportMissingServerToken(prisma);
        return;
      }

      // A POS terminal runs for days, so the token can die mid-session — the login handlers only
      // check it as someone signs in. Left in place it turns every upload below into a 401.
      if (isTokenExpired(token)) {
        console.warn('[sync] Stored VPS token has expired — dropping it and pausing uploads');
        clearServerToken();
        await prisma.systemSetting.deleteMany({ where: { key: 'server_token' } });
        await this.reportMissingServerToken(prisma);
        return;
      }

      if (localConfig?.storeId) {
        const tokenStoreId = decodeTokenStoreId(token);
        console.log(`[sync] guard — token.storeId=${tokenStoreId ?? 'null'} localConfig.storeId=${localConfig.storeId}`);
        if (tokenStoreId !== undefined && tokenStoreId !== localConfig.storeId) {
          console.warn(`[sync] Token storeId (${tokenStoreId ?? 'null'}) ≠ LocalConfig storeId (${localConfig.storeId}) — clearing stale token, skipping sync`);
          clearServerToken();
          return;
        }
      }

      // Check internet connectivity
      const isOnline = await this.checkConnectivity();
      if (!isOnline) {
        console.warn('[sync] VPS unreachable — skipping sync cycle');
        return;
      }

      const currentUser = getCurrentUser();

      console.log(`[sync] Cycle start — user: ${currentUser?.phone ?? 'none'}, role: ${currentUser?.role ?? 'none'}`);

      // Upload locally-created categories, suppliers, products, and arrivals to VPS.
      // Only ADMIN users have permission to upload product/supplier/category data.
      //
      // When the store is locked to cashier-only operation the server owns all master data, so
      // this whole block is skipped — that is the entire "narrowed sync" scope, because users,
      // categories, suppliers, products, arrivals and settings all upload from inside
      // uploadLocalData(). Sales, shifts, heartbeat and logs below are outside it and keep
      // running. `posAdminLocked` is false unless a super admin opted this store in, so an
      // un-opted-in or never-activated terminal behaves exactly as it always has.
      const masterUpload = shouldUploadMasterData(currentUser?.role, localConfig);
      if (masterUpload) {
        try {
          await uploadLocalData();
        } catch (uploadError) {
          console.error('Upload sync failed (non-fatal):', uploadError instanceof Error ? uploadError.message : uploadError);
        }
      }

      // Nasiya — all roles: customers a cashier created and the ledger behind every balance. Inside
      // the admin block above, a cashier-only till never sent its debts and no other till saw them.
      try {
        await uploadNasiya({ staffUploaded: masterUpload });
      } catch (nasiyaError) {
        console.error('Nasiya upload failed (non-fatal):', nasiyaError instanceof Error ? nasiyaError.message : nasiyaError);
      }

      // Sync sales (upload local sales to VPS) — all roles
      try {
        this.lastSalesSync = await syncSales();
        if (this.lastSalesSync.failed > 0 || this.lastSalesSync.skippedReason) {
          this.notifyRenderer('sync:salesStatus', this.lastSalesSync);
        }
      } catch (salesError) {
        console.error('Sales sync failed (non-fatal):', salesError instanceof Error ? salesError.message : salesError);
      }

      // Fiscal state of sales already uploaded — all roles, after the sales so their receipts are
      // there to be matched. Feeds the bank-turnover figures on the dashboard.
      try {
        await syncFiscalStatus();
      } catch (fiscalError) {
        console.error('Fiscal status sync failed (non-fatal):', fiscalError instanceof Error ? fiscalError.message : fiscalError);
      }

      // Split-payment lines of sales already uploaded — all roles, on their own endpoint (an older
      // server rejects unknown fields on /sales/sync). Bank turnover and reports read them.
      try {
        await syncSalePayments();
      } catch (paymentsError) {
        console.error('Sale payments sync failed (non-fatal):', paymentsError instanceof Error ? paymentsError.message : paymentsError);
      }

      // Sync closed shifts — all roles, deliberately NOT inside uploadLocalData(), which only
      // runs for ADMIN. Shifts are closed by cashiers, so gating this on ADMIN would mean the
      // drawer counts never reach the server on a normal terminal.
      //
      // After sales on purpose: the server buckets a shift's takings from the sales it already
      // holds, so uploading the shift first would briefly show it against an incomplete day.
      try {
        await syncSmenas();
      } catch (smenaError) {
        console.error('Smena sync failed (non-fatal):', smenaError instanceof Error ? smenaError.message : smenaError);
      }

      // Sync categories (download from VPS — must come before products)
      await syncCategories();

      // Sync suppliers, users, and store settings (download from VPS to all terminals)
      await syncSuppliers();
      await syncUsers();
      // After the users, so a customer created on another till is here before their ledger rows.
      try {
        await pullDebtLedger();
      } catch (ledgerError) {
        console.error('Nasiya ledger pull failed (non-fatal):', ledgerError instanceof Error ? ledgerError.message : ledgerError);
      }
      await syncSettings();

      // Sync products (download updated products from VPS)
      const stockConflicts = await syncProducts();

      // Products deleted on the dashboard since the last cycle: drop (or hide) this till's copy.
      // After the pull, so a barcode re-added on the dashboard is already back here — and the
      // server leaves a live barcode out of the deletion feed anyway.
      try {
        await syncDeletedProducts();
      } catch (deleteError) {
        console.error(
          'Deleted-products sync failed (non-fatal):',
          deleteError instanceof Error ? deleteError.message : deleteError,
        );
      }

      // Pull store config (AI token limit, etc.) from VPS
      await this.syncStoreConfig();

      // Send heartbeat to VPS so admins can monitor all terminals
      await this.sendHeartbeat();

      // Upload buffered logs to VPS for super admin visibility
      await this.uploadLogs();

      this.lastSyncTime = new Date();

      // Notify renderer process
      this.notifyRenderer('sync:completed');

      // Warn if any products have negative stock after VPS overwrite
      if (stockConflicts.length > 0) {
        this.notifyRenderer('sync:stockConflict', stockConflicts);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.lastError = errorMessage;
      console.error('Sync failed:', errorMessage);

      // Notify renderer about error
      this.notifyRenderer('sync:failed', { message: errorMessage });
    } finally {
      this.isSyncing = false;
    }
  }

  /**
   * A satellite's cycle: refresh the read cache from the main. An unreachable main is not an error
   * worth a toast every cycle — the reachability banner already says it, and selling is refused at
   * the moment it matters — so it is only recorded.
   */
  private async syncWithMainTerminal(): Promise<void> {
    try {
      const stockConflicts = await syncWithMain();
      this.lastSyncTime = new Date();
      this.notifyRenderer('sync:completed');
      if (stockConflicts.length > 0) {
        this.notifyRenderer('sync:stockConflict', stockConflicts);
      }
    } catch (error) {
      if (error instanceof MainLinkError) {
        this.lastError = error.code;
        console.warn(`[sync] main terminal: ${error.code}`);
        return;
      }
      throw error;
    }
  }

  /**
   * Raise an error only when the missing token is actually costing us something.
   *
   * Before anyone logs in there is nothing to upload and nothing to say. Once sales or closed
   * shifts have queued up, silence is the wrong answer: the terminal looks fine, the cashier
   * keeps selling, and the money only reaches the server whenever an admin next signs in.
   */
  private async reportMissingServerToken(
    prisma: ReturnType<typeof getPrismaClient>,
  ): Promise<void> {
    const [pendingSales, pendingShifts] = await Promise.all([
      prisma.sale.count({ where: { synced: false } }),
      prisma.smena.count({ where: { synced: false, status: 'CLOSED' } }),
    ]);

    if (pendingSales === 0 && pendingShifts === 0) return;

    // An i18n key: the renderer translates it and falls back to the raw text for other errors.
    this.lastError = 'sync.errors.serverLoginRequired';
    console.warn(
      `[sync] No VPS token — ${pendingSales} sale(s) and ${pendingShifts} shift(s) are waiting. ` +
      'Someone has to sign in with a phone and password to send them.',
    );
    this.notifyRenderer('sync:failed', {
      message: this.lastError,
      pendingSales,
      pendingShifts,
    });
  }

  // Server-controlled config (license, mode, override password, AI limit): see store-config.ts,
  // which the login path and the terminal-role panel also call — an OFFLINE_ONLY till never
  // gets here.
  private async syncStoreConfig(): Promise<void> {
    await pullStoreConfig((channel, data) => this.notifyRenderer(channel, data));
  }

  private async uploadLogs(): Promise<void> {
    const entries = flushLogs();
    if (entries.length === 0) return;
    const config = getAppConfig();
    const token = getServerToken();
    if (!token) return;
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      await fetch(`${config.vpsApiUrl}/logs/upload`, {
        method: 'POST',
        signal: controller.signal,
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ terminalId: config.terminalId, storeId: config.storeId, entries }),
      });
      clearTimeout(timeoutId);
    } catch {
      // fire-and-forget — entries are already saved to local log file
    }
  }

  private async sendHeartbeat(): Promise<void> {
    const config = getAppConfig();
    const token = getServerToken();
    if (!token) return;

    try {
      const prisma = getPrismaClient();
      const unsyncedCount = await prisma.sale.count({ where: { synced: false } });
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      await fetch(`${config.vpsApiUrl}/terminals/heartbeat`, {
        method: 'POST',
        signal: controller.signal,
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          terminalId: config.terminalId,
          storeId: config.storeId,
          unsyncedCount,
          lastSyncAt: new Date().toISOString(),
        }),
      });
      clearTimeout(timeoutId);
    } catch {
      // Heartbeat is fire-and-forget — VPS endpoint may not exist yet
    }
  }

  private async checkConnectivity(): Promise<boolean> {
    const config = getAppConfig();

    // Skip connectivity check for local development
    const isLocal = config.vpsApiUrl.includes('localhost') || config.vpsApiUrl.includes('127.0.0.1');
    if (isLocal) {
      return true;
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const response = await fetch(`${config.vpsApiUrl}/health`, {
        method: 'GET',
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      return response.ok;
    } catch {
      return false;
    }
  }

  private notifyRenderer(channel: string, data?: unknown): void {
    const windows = BrowserWindow.getAllWindows();
    if (windows.length > 0) {
      windows[0].webContents.send(channel, data);
    }
  }

  getStatus(): {
    isSyncing: boolean;
    lastSyncTime: Date | null;
    lastError: string | null;
    lastSalesSync: SalesSyncResult | null;
  } {
    return {
      isSyncing: this.isSyncing,
      lastSyncTime: this.lastSyncTime,
      lastError: this.lastError,
      lastSalesSync: this.lastSalesSync,
    };
  }

  // Force immediate sync
  async triggerSync(): Promise<void> {
    await this.sync();
  }

  /**
   * The debtors page's Sync button: nasiya only, now, instead of waiting for the next cycle.
   *
   * Push first — customers this till created or edited, then its new ledger rows — so the pull
   * that follows already includes this till's latest payment. Then the users (a customer created
   * on another till must exist here before their rows), then the ledger, which merges rows by id
   * and re-derives balances. Order does not decide correctness — rows merge, they never
   * overwrite — it only makes one press show the final state.
   *
   * Shares the cycle's lock: a cycle in progress is waited for (it does this same work), never
   * run alongside, so two pulls cannot race on the ledger cursor.
   */
  async syncNasiyaNow(): Promise<NasiyaSyncResult> {
    for (let waited = 0; this.isSyncing && waited < NASIYA_WAIT_MS; waited += 500) {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    if (this.isSyncing) return { ok: false, reason: 'busy' };
    if (isWriteFrozen()) return { ok: false, reason: 'busy' };

    this.isSyncing = true;
    try {
      const prisma = getPrismaClient();
      const localConfig = await prisma.localConfig.findUnique({ where: { id: 'config' } });
      // A satellite's debtors live on its main, which it reads live; an offline-only main has no
      // server. Neither has anything to sync from here.
      if (syncTarget(localConfig) !== 'vps') return { ok: false, reason: 'not_applicable' };

      const token = getServerToken();
      if (!token || isTokenExpired(token)) return { ok: false, reason: 'no_token' };
      if (!(await this.checkConnectivity())) return { ok: false, reason: 'offline' };

      await uploadNasiya({ staffUploaded: false });
      await syncUsers();
      const pulled = await pullDebtLedger();
      if (!pulled) return { ok: false, reason: 'error' };
      return { ok: true, at: new Date().toISOString() };
    } catch (error) {
      console.error('[sync] nasiya sync failed:', error instanceof Error ? error.message : error);
      return { ok: false, reason: 'error' };
    } finally {
      this.isSyncing = false;
    }
  }
}
