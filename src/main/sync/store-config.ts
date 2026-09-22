import { BrowserWindow } from 'electron';
import { getAppConfig } from '../config/app-config';
import { getPrismaClient } from '../database/sqlite-client';
import { getServerToken } from './queue-manager';
import { syncLocalServerWithMode } from '../local-server';
import { acceptLicense, terminalClaimQuery } from '../license/license';
import { isSatellite } from '../lan/role';

/**
 * Server-controlled config for this store, from GET /store-config: the signed license, the
 * operating mode, the super-admin (manager-override) password hash and the AI token limit.
 *
 * The sync loop calls this every cycle — but an OFFLINE_ONLY store never syncs, so on its own
 * that left such a till with whatever it got at setup: a super-admin password set or changed on
 * the dashboard afterwards never arrived, and pairing a satellite said none was configured. So it
 * also runs after a password sign-in that got a fresh token, and when the terminal-role panel
 * finds no password — any time this till holds a credential the server still accepts.
 *
 * Returns whether the server answered.
 */

type Notify = (channel: string, data?: unknown) => void;

function broadcast(channel: string, data?: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send(channel, data);
  }
}

/** The token armed by a login this session, else the one kept from the last. */
async function serverToken(): Promise<string | null> {
  const inMemory = getServerToken();
  if (inMemory) return inMemory;
  const row = await getPrismaClient()
    .systemSetting.findUnique({ where: { key: 'server_token' } })
    .catch(() => null);
  return row?.value || null;
}

export async function pullStoreConfig(notify: Notify = broadcast): Promise<boolean> {
  // A satellite's server is its main, never the VPS (LAN plan §1).
  if (await isSatellite().catch(() => false)) return false;
  const config = getAppConfig();
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    const token = await serverToken();
    if (!token) return false;
    // Naming this till (and its satellites) registers them for the store's terminal slots.
    const response = await fetch(`${config.vpsApiUrl}/store-config${await terminalClaimQuery()}`, {
      signal: controller.signal,
      headers: { Authorization: `Bearer ${token}` },
    });
    clearTimeout(timeoutId);
    if (!response.ok) return false;

    const data = await response.json() as Record<string, unknown>;
    const prisma = getPrismaClient();

    // The store's signed license, renewed every cycle (src/main/license/). Taken only when it is
    // genuine, this store's and newer than the one held.
    if (typeof data.license === 'string') await acceptLicense(data.license);

    if (typeof data.ai_token_limit_daily === 'number') {
      await prisma.systemSetting.upsert({
        where: { key: 'ai_token_limit_daily' },
        update: { value: String(data.ai_token_limit_daily) },
        create: { key: 'ai_token_limit_daily', value: String(data.ai_token_limit_daily) },
      });
    }

    // Refresh the cached operating mode. This is what makes the super admin's toggle reach a
    // live terminal within one sync cycle — no rebuild, and flipping it back is the rollback.
    // Only write fields the server actually sent, so an older server can't silently unlock a
    // terminal by omitting them.
    const modeUpdate: {
      mode?: string;
      posAdminLocked?: boolean;
      superAdminPassword?: string | null;
    } = {};
    if (data.mode === 'OFFLINE_ONLY' || data.mode === 'ONLINE') {
      modeUpdate.mode = data.mode;
    }
    if (typeof data.pos_admin_locked === 'boolean') {
      modeUpdate.posAdminLocked = data.pos_admin_locked;
    }
    // The manager-override password, so changing it in the dashboard reaches a live terminal
    // within one cycle instead of waiting for setup to be re-run. Keyed on the field being
    // present rather than truthy: an explicit null is the super admin clearing the override,
    // which must take effect, while an older server omits the key entirely and changes nothing.
    if ('super_admin_password_hash' in data) {
      const hash = data.super_admin_password_hash;
      modeUpdate.superAdminPassword = typeof hash === 'string' && hash ? hash : null;
    }
    if (Object.keys(modeUpdate).length > 0) {
      await prisma.localConfig.update({ where: { id: 'config' }, data: modeUpdate });
      // Only the mode fields reach the renderer. The password hash stays in the main process —
      // the renderer never needs it (it asks main to verify) and sending it would put it in a
      // browser context, which is exactly what fetching it in main was meant to avoid.
      notify('config:modeChanged', {
        ...(modeUpdate.mode !== undefined ? { mode: modeUpdate.mode } : {}),
        ...(modeUpdate.posAdminLocked !== undefined
          ? { posAdminLocked: modeUpdate.posAdminLocked }
          : {}),
      });
      // A store switched to OFFLINE_ONLY gains its own LAN dashboard, and one switched back
      // loses it — within the same cycle the mode itself lands, so neither needs a restart.
      if (modeUpdate.mode) {
        void syncLocalServerWithMode().catch((err) =>
          console.error('[local-server] mode change failed:', err),
        );
      }
    }
    return true;
  } catch {
    // Offline or endpoint not yet implemented — keep what is cached
    return false;
  }
}
