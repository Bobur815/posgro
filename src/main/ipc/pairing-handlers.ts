import { ipcMain } from 'electron';
import * as bcrypt from 'bcryptjs';
import { getPrismaClient } from '../database/sqlite-client';
import { getLanAddress } from '../network/lan-address';
import {
  cancelPairingCode,
  getPairingCode,
  issuePairingCode,
} from '../local-server/pairing';
import { getLocalServerStatus, syncLocalServerWithMode } from '../local-server';
import { AttemptThrottle } from './override-throttle';

/**
 * Pairing satellites, from the main terminal's side.
 *
 * Issuing a code is gated on the **super-admin password**, not the terminal PIN or a store admin's
 * password (§11.2). A pairing code grants a machine standing access to the shop's data, which is a
 * different class of act from editing a URL — and `auth:verifyTerminalAccess` accepts any active
 * ADMIN's password or a four-digit PIN.
 *
 * The password is verified here rather than reusing `auth:verifySuperAdminPassword` from the
 * renderer, so that a caller cannot verify once and then issue codes forever: each issue carries
 * its own proof.
 */

const issueThrottle = new AttemptThrottle();

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
    if (issueThrottle.isLockedOut()) {
      throw new Error('settings.pairingThrottled');
    }

    const prisma = getPrismaClient();
    const config = await prisma.localConfig.findUnique({ where: { id: 'config' } });

    // A store with no override configured cannot pair at all, rather than falling back to a weaker
    // gate. `verifySuperAdminPassword` returns false in that case for the same reason: a missing
    // configuration must not read as an open door.
    if (!config?.superAdminPassword) {
      throw new Error('settings.pairingNeedsSuperAdmin');
    }
    if (!config.isMain) {
      throw new Error('settings.pairingNotMain');
    }

    if (!superAdminPassword || !(await bcrypt.compare(superAdminPassword, config.superAdminPassword))) {
      issueThrottle.recordFailure();
      throw new Error('settings.superAdminPasswordWrong');
    }
    issueThrottle.reset();

    const { code, expiresAt } = issuePairingCode();
    await syncLocalServerWithMode();

    const status = getLocalServerStatus();
    return {
      code,
      expiresAt,
      // What the operator has to type into the satellite. Null when the listener could not bind or
      // the machine has no usable LAN address — in which case the code alone is useless, and the
      // dialog should say so rather than showing a code that cannot be redeemed.
      mainTerminalUrl:
        status.running && status.port && getLanAddress()
          ? `http://${getLanAddress()}:${status.port}/api`
          : null,
      serverError: status.error,
    };
  });

  /** The outstanding code, so reopening the dialog does not mint a second one. */
  ipcMain.handle('pairing:getCode', async () => getPairingCode());

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
   */
  ipcMain.handle('pairing:remove', async (_event, terminalId: string) => {
    await getPrismaClient().pairedTerminal.deleteMany({ where: { terminalId } });
    await syncLocalServerWithMode();
    return true;
  });
}
