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
  pairingErrorKey,
  probeMainTerminal,
} from '../lan/main-terminal-client';
import { log } from '../logger';
import { DEVICE_SECRET_KEY, SESSION_USER_KEY, resetMainLink } from '../lan/main-link';

/**
 * Pairing satellites, and changing this terminal's role (tasks/LAN_MAIN_TERMINAL_PLAN.md §11).
 *
 * Every act here is gated on the **super-admin password**, not the terminal PIN or a store admin's
 * password (§11.2). Issuing a code, removing a satellite, joining a main, leaving one — each decides
 * which machine owns the shop's data, a different class of act from editing a URL, and
 * `auth:verifyTerminalAccess` (which unlocks the gear dialog) accepts any active ADMIN's password or
 * a four-digit PIN.
 *
 * The password travels with each call and is verified here rather than trusting an earlier
 * `auth:verifySuperAdminPassword` from the renderer, so a caller cannot verify once and then act
 * forever: each act carries its own proof.
 */

/**
 * One throttle for every role act. They all check the same password on the same machine; separate
 * throttles would only have multiplied the guesses available to someone at the till.
 */
const superAdminThrottle = new AttemptThrottle();

type Prisma = ReturnType<typeof getPrismaClient>;
type LocalConfigRow = NonNullable<Awaited<ReturnType<Prisma['localConfig']['findUnique']>>>;

/**
 * The terminal's config, once `password` has proved to be its super-admin password.
 *
 * A store with no super-admin password configured cannot change roles at all, rather than falling
 * back to a weaker gate: a missing configuration must not read as an open door (§11.2).
 */
async function requireSuperAdmin(prisma: Prisma, password: string): Promise<LocalConfigRow> {
  if (superAdminThrottle.isLockedOut()) throw new Error('settings.pairingThrottled');

  const config = await prisma.localConfig.findUnique({ where: { id: 'config' } });
  if (!config) throw new Error('settings.terminalNotConfigured');
  if (!config.superAdminPassword) throw new Error('settings.pairingNeedsSuperAdmin');

  if (!password || !(await bcrypt.compare(password, config.superAdminPassword))) {
    superAdminThrottle.recordFailure();
    throw new Error('settings.superAdminPasswordWrong');
  }
  superAdminThrottle.reset();
  return config;
}

/*
 * A satellite keeps the device secret it was issued under DEVICE_SECRET_KEY (lan/main-link.ts).
 * Plaintext, like the `server_token` row beside it — this is a credential the machine must present,
 * so it has to be readable here. What limits the damage is that it is worth nothing anywhere else:
 * it names one terminal, on one main, on one shop network.
 */

/**
 * What a role change leaves behind that belongs to the old role: the catalog cursor (a satellite
 * pages through its main's clock, a main through the VPS's — carrying one over would skip rows,
 * §6.5), the signed-in person's saved profile, and whatever the link held in memory.
 *
 * The renderer relaunches the app after any role change, which clears the rest: the session a new
 * main never issued, and a VCR service started for a role this terminal no longer has.
 */
async function forgetPreviousRole(prisma: Prisma): Promise<void> {
  await prisma.systemSetting.deleteMany({
    where: { key: { in: ['last_product_sync', SESSION_USER_KEY] } },
  });
  resetMainLink();
}

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
    const config = await requireSuperAdmin(prisma, superAdminPassword);
    if (!config.isMain) throw new Error('settings.pairingNotMain');

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
    const prisma = getPrismaClient();
    await requireSuperAdmin(prisma, superAdminPassword);
    await prisma.pairedTerminal.deleteMany({ where: { terminalId } });
    await syncLocalServerWithMode();
    log.info(`[pairing] satellite ${terminalId} removed`);
    return true;
  });

  /**
   * Become a satellite of the main terminal at `mainTerminalUrl` — or, on a satellite, re-pair with
   * a different main after a promotion (§11.6).
   *
   * The order matters: probe, pair, **prove the credential works**, and only then write the role.
   * A pairing that half-succeeded would otherwise leave a till believing it is a satellite of
   * something it cannot talk to — unable to sell, and unable to explain why.
   */
  ipcMain.handle(
    'pairing:joinAsSatellite',
    async (
      _event,
      superAdminPassword: string,
      input: { mainTerminalUrl: string; code: string; name?: string },
    ) => {
      const prisma = getPrismaClient();
      const config = await requireSuperAdmin(prisma, superAdminPassword);

      // A main with satellites of its own must not be demoted out from under them.
      if (config.isMain && (await prisma.pairedTerminal.count()) > 0) {
        throw new Error('settings.cannotDemoteWithSatellites');
      }

      const url = normaliseMainUrl(input.mainTerminalUrl ?? '');
      const probe = await probeMainTerminal(url, config.storeId);
      if (!probe.ok) throw new Error(`settings.mainTerminal_${probe.reason.replace(/-/g, '_')}`);

      let secret: string;
      let paired: Awaited<ReturnType<typeof pairWithMain>>;
      try {
        paired = await pairWithMain(url, input.code, config.terminalId, input.name);
        if (!paired.secret) throw new Error('no secret in the answer');
        secret = paired.secret;
        // Prove it before believing it. If the secret we were just handed does not work, nothing
        // has been written yet and the till is still exactly what it was.
        await fetchTerminalToken(url, config.terminalId, secret);
      } catch (err) {
        log.warn(`[pairing] joining ${url} failed: ${err instanceof Error ? err.message : err}`);
        throw new Error(pairingErrorKey(err));
      }

      await prisma.systemSetting.upsert({
        where: { key: DEVICE_SECRET_KEY },
        update: { value: secret },
        create: { key: DEVICE_SECRET_KEY, value: secret },
      });
      await prisma.localConfig.update({
        where: { id: 'config' },
        data: { isMain: false, mainTerminalUrl: url },
      });
      await forgetPreviousRole(prisma);

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
   *
   * This is §11.5's emergency promotion, and the dialog says so before it runs: what this till has
   * is its read cache, not the shop's truth. The warning logged here is the record §11.5 asks for —
   * which main it left, and how old its copy of the catalog was — until the generation counter
   * (§11.3) exists to carry it.
   */
  ipcMain.handle('pairing:leave', async (_event, superAdminPassword: string) => {
    const prisma = getPrismaClient();
    const config = await requireSuperAdmin(prisma, superAdminPassword);

    const cursor = await prisma.systemSetting.findUnique({ where: { key: 'last_product_sync' } });
    log.warn(
      `[pairing] ${config.terminalId} left main ${config.mainTerminalUrl ?? '(none)'} at ` +
        `${new Date().toISOString()} and is now an independent main. Its catalog was last pulled ` +
        `up to ${cursor?.value ?? 'never'}; sales rung up at other tills since then are not on it.`,
    );

    await prisma.systemSetting.deleteMany({ where: { key: DEVICE_SECRET_KEY } });
    await prisma.localConfig.update({
      where: { id: 'config' },
      data: { isMain: true, mainTerminalUrl: null },
    });
    await forgetPreviousRole(prisma);
    await syncLocalServerWithMode();
    return true;
  });
}
