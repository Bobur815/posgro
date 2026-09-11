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
import {
  fetchTerminalToken,
  normaliseMainUrl,
  pairWithMain,
  probeMainTerminal,
} from '../lan/main-terminal-client';
import { log } from '../logger';

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

/** Separate from issuing: joining is done on a different machine by a different person. */
const joinThrottle = new AttemptThrottle();

/**
 * Where a satellite keeps the device secret it was issued.
 *
 * Plaintext, like the `server_token` row beside it — this is a credential the machine must present,
 * so it has to be readable here. What limits the damage is that it is worth nothing anywhere else:
 * it names one terminal, on one main, on one shop network.
 */
const DEVICE_SECRET_KEY = 'lan_device_secret';

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

  /**
   * Become a satellite of the main terminal at `mainTerminalUrl`.
   *
   * The order matters: probe, pair, **prove the credential works**, and only then write the role.
   * A pairing that half-succeeded would otherwise leave a till believing it is a satellite of
   * something it cannot talk to — unable to sell, and unable to explain why.
   *
   * Gated on the super-admin password like any other role change (§11.2): this hands the till's
   * authority over its own data to another machine.
   */
  ipcMain.handle(
    'pairing:joinAsSatellite',
    async (
      _event,
      superAdminPassword: string,
      input: { mainTerminalUrl: string; code: string; name?: string },
    ) => {
      if (joinThrottle.isLockedOut()) throw new Error('settings.pairingThrottled');

      const prisma = getPrismaClient();
      const config = await prisma.localConfig.findUnique({ where: { id: 'config' } });
      if (!config) throw new Error('settings.terminalNotConfigured');

      if (!config.superAdminPassword) throw new Error('settings.pairingNeedsSuperAdmin');
      if (
        !superAdminPassword ||
        !(await bcrypt.compare(superAdminPassword, config.superAdminPassword))
      ) {
        joinThrottle.recordFailure();
        throw new Error('settings.superAdminPasswordWrong');
      }
      joinThrottle.reset();

      // A main with satellites of its own must not be demoted out from under them.
      if (config.isMain && (await prisma.pairedTerminal.count()) > 0) {
        throw new Error('settings.cannotDemoteWithSatellites');
      }

      const url = normaliseMainUrl(input.mainTerminalUrl ?? '');
      const probe = await probeMainTerminal(url, config.storeId);
      if (!probe.ok) throw new Error(`settings.mainTerminal_${probe.reason.replace(/-/g, '_')}`);

      const paired = await pairWithMain(url, input.code, config.terminalId, input.name);
      if (!paired.secret) throw new Error('settings.pairingFailed');

      // Prove it before believing it. If the secret we were just handed does not work, nothing has
      // been written yet and the till is still exactly what it was.
      await fetchTerminalToken(url, config.terminalId, paired.secret);

      await prisma.systemSetting.upsert({
        where: { key: DEVICE_SECRET_KEY },
        update: { value: paired.secret },
        create: { key: DEVICE_SECRET_KEY, value: paired.secret },
      });
      await prisma.localConfig.update({
        where: { id: 'config' },
        data: { isMain: false, mainTerminalUrl: url },
      });

      // A satellite serves nothing, so this closes the listener if one was open.
      await syncLocalServerWithMode();

      log.info(`[pairing] now a satellite of ${paired.mainTerminalId} (store ${paired.storeId})`);
      return { storeName: paired.storeName, mainTerminalId: paired.mainTerminalId };
    },
  );

  /**
   * Stop being a satellite and go back to being an independent main.
   *
   * Deliberately local-only: it does not ask the main to forget this terminal, because the usual
   * reason to run it is that the main cannot be reached. Removing the row on the main is a
   * separate act, done from the main (`pairing:remove`).
   */
  ipcMain.handle('pairing:leave', async (_event, superAdminPassword: string) => {
    const prisma = getPrismaClient();
    const config = await prisma.localConfig.findUnique({ where: { id: 'config' } });
    if (!config?.superAdminPassword) throw new Error('settings.pairingNeedsSuperAdmin');
    if (
      !superAdminPassword ||
      !(await bcrypt.compare(superAdminPassword, config.superAdminPassword))
    ) {
      throw new Error('settings.superAdminPasswordWrong');
    }

    await prisma.systemSetting.deleteMany({ where: { key: DEVICE_SECRET_KEY } });
    await prisma.localConfig.update({
      where: { id: 'config' },
      data: { isMain: true, mainTerminalUrl: null },
    });
    await syncLocalServerWithMode();
    return true;
  });
}
