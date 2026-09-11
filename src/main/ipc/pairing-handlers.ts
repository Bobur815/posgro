import { ipcMain } from 'electron';
import { getPrismaClient } from '../database/sqlite-client';
import { getLanAddress } from '../network/lan-address';
import {
  cancelPairingCode,
  getPairingCode,
  issuePairingCode,
} from '../local-server/pairing';
import { getLocalServerStatus, syncLocalServerWithMode } from '../local-server';
import { requireSuperAdmin } from '../auth/super-admin';
import { newLineage } from '../lan/lineage';
import { joinMain, leaveMain, repointMain, type JoinInput } from '../lan/role-change';
import { cancelHandoffCode, getHandoffState, issueHandoffCode } from '../local-server/handoff';
import {
  getPendingTakeover,
  resolvePendingTakeover,
  takeOverAsMain,
} from '../lan/takeover';
import { log } from '../logger';

/**
 * Pairing satellites, and changing this terminal's role (tasks/LAN_MAIN_TERMINAL_PLAN.md §11).
 *
 * Every act here is gated on the **super-admin password** (`auth/super-admin.ts`, §11.2), verified
 * on each call. The role changes themselves live in `lan/role-change.ts`, so the same code runs in
 * the app and in the two-till end-to-end test; what is here is the main-side pairing code and the
 * IPC surface.
 */

/**
 * What the operator types into the satellite besides the code. Null when the listener could not
 * bind or the machine has no usable LAN address — then the code alone is useless, and the dialog
 * shows `serverError` rather than a code that cannot be redeemed.
 */
function whereToFindThisMain(): { mainTerminalUrl: string | null; serverError: string | null } {
  const status = getLocalServerStatus();
  const address = getLanAddress();
  return {
    mainTerminalUrl:
      status.running && status.port && address ? `http://${address}:${status.port}/api` : null,
    serverError: status.error,
  };
}

export function setupPairingHandlers(): void {
  /**
   * Mint a pairing code and open the door.
   *
   * Issuing also starts the LAN server if it was not already running, because otherwise the first
   * pairing could never happen — the server runs once a satellite exists, and a satellite has to
   * reach the server to come into existence. The code's expiry closes it again on the next sync
   * cycle if nobody used it.
   */
  ipcMain.handle('pairing:issueCode', async (_event, superAdminPassword: string) => {
    const prisma = getPrismaClient();
    const config = await requireSuperAdmin(superAdminPassword);
    if (!config.isMain) throw new Error('settings.pairingNotMain');

    // The first till this main pairs starts its lineage (§11.3): from here on, every satellite
    // knows which chain of mains it belongs to, and can refuse one that was replaced.
    if (!config.lanLineage) {
      await prisma.localConfig.update({
        where: { id: 'config' },
        data: { lanLineage: newLineage() },
      });
    }

    const { code, expiresAt } = issuePairingCode();
    await syncLocalServerWithMode();
    return { code, expiresAt, ...whereToFindThisMain() };
  });

  /**
   * The outstanding code, so reopening the dialog shows it again instead of minting a second one —
   * with the address that goes with it, which is half of what the operator has to type.
   */
  ipcMain.handle('pairing:getCode', async () => {
    const active = getPairingCode();
    return active ? { ...active, ...whereToFindThisMain() } : null;
  });

  ipcMain.handle('pairing:cancelCode', async () => {
    cancelPairingCode();
    // Closes the listener again unless a satellite is already paired, or the store is OFFLINE_ONLY.
    await syncLocalServerWithMode();
    return true;
  });

  /** The satellites paired with this terminal. Never returns `secretHash`. */
  ipcMain.handle('pairing:list', async () => {
    const rows = await getPrismaClient().pairedTerminal.findMany({
      orderBy: { pairedAt: 'asc' },
      select: { terminalId: true, name: true, pairedAt: true, lastSeenAt: true },
    });
    return rows.map((r: { terminalId: string; name: string | null; pairedAt: Date; lastSeenAt: Date | null }) => ({
      terminalId: r.terminalId,
      name: r.name,
      pairedAt: r.pairedAt.toISOString(),
      lastSeenAt: r.lastSeenAt ? r.lastSeenAt.toISOString() : null,
    }));
  });

  /**
   * Unpair a satellite. The credential stops working immediately, and once the last one is gone
   * the LAN server closes — an ONLINE shop that stops using satellites stops listening.
   *
   * Gated like issuing: the dialog it lives in is unlocked by a PIN, and cutting a till off from the
   * shop's stock mid-shift is not a PIN-level act.
   */
  ipcMain.handle('pairing:remove', async (_event, superAdminPassword: string, terminalId: string) => {
    await requireSuperAdmin(superAdminPassword);
    await getPrismaClient().pairedTerminal.deleteMany({ where: { terminalId } });
    await syncLocalServerWithMode();
    log.info(`[pairing] satellite ${terminalId} removed`);
    return true;
  });

  ipcMain.handle(
    'pairing:joinAsSatellite',
    async (_event, superAdminPassword: string, input: JoinInput) => joinMain(superAdminPassword, input),
  );

  ipcMain.handle('pairing:leave', async (_event, superAdminPassword: string) => {
    await leaveMain(superAdminPassword);
    return true;
  });

  // ── Handing the main role to another till (§11.4) ──────────────────────────────────────────

  /**
   * On the main: consent to a handoff, as a code for the till taking over. Only a till already
   * paired with this main can take it over, so with none paired there is nobody to hand over to.
   */
  ipcMain.handle('pairing:issueHandoffCode', async (_event, superAdminPassword: string) => {
    const config = await requireSuperAdmin(superAdminPassword);
    if (!config.isMain) throw new Error('settings.pairingNotMain');
    if ((await getPrismaClient().pairedTerminal.count()) === 0) {
      throw new Error('settings.handoffNoSatellites');
    }
    const issued = issueHandoffCode();
    log.warn('[handoff] handoff code issued');
    return issued;
  });

  ipcMain.handle('pairing:getHandoffState', async () => getHandoffState());

  ipcMain.handle('pairing:cancelHandoffCode', async () => {
    cancelHandoffCode();
    return true;
  });

  /** On a satellite: take the main role over. The renderer restarts the app on success. */
  ipcMain.handle('pairing:takeOver', async (_event, superAdminPassword: string, code: string) =>
    takeOverAsMain(superAdminPassword, { code }),
  );

  ipcMain.handle('pairing:pendingTakeover', async () => getPendingTakeover());

  ipcMain.handle(
    'pairing:resolveTakeover',
    async (_event, superAdminPassword: string, action: 'finish' | 'discard') => {
      await resolvePendingTakeover(superAdminPassword, action === 'finish' ? 'finish' : 'discard');
      return true;
    },
  );

  /** On a satellite: its main's new address, after a handoff (§11.6). */
  ipcMain.handle(
    'pairing:repoint',
    async (_event, superAdminPassword: string, mainTerminalUrl: string) =>
      repointMain(superAdminPassword, mainTerminalUrl),
  );
}
