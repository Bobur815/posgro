import { getPrismaClient } from '../database/sqlite-client';
import { syncLocalServerWithMode } from '../local-server';
import { requireSuperAdmin } from '../auth/super-admin';
import { log } from '../logger';
import {
  fetchTerminalToken,
  normaliseMainUrl,
  pairWithMain,
  pairingErrorKey,
  probeMainTerminal,
} from './main-terminal-client';
import { DEVICE_SECRET_KEY, SESSION_USER_KEY, resetMainLink } from './main-link';
import { newLineage } from './lineage';

/**
 * Changing what this terminal is on the shop's LAN (tasks/LAN_MAIN_TERMINAL_PLAN.md §11): joining a
 * main, leaving one. The IPC handlers in `ipc/pairing-handlers.ts` are thin wrappers over these, so
 * the same code runs in the app and in the two-till end-to-end test.
 *
 * Every function here takes the super-admin password and checks it itself (§11.2).
 */

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
export async function forgetPreviousRole(): Promise<void> {
  await getPrismaClient().systemSetting.deleteMany({
    where: { key: { in: ['last_product_sync', SESSION_USER_KEY] } },
  });
  resetMainLink();
}

export interface JoinInput {
  mainTerminalUrl: string;
  code: string;
  name?: string;
}

/**
 * Become a satellite of the main terminal at `mainTerminalUrl` — or, on a satellite, re-pair with
 * a different main after a promotion (§11.6).
 *
 * The order matters: probe, pair, **prove the credential works**, and only then write the role.
 * A pairing that half-succeeded would otherwise leave a till believing it is a satellite of
 * something it cannot talk to — unable to sell, and unable to explain why.
 */
export async function joinMain(
  superAdminPassword: string,
  input: JoinInput,
): Promise<{ storeName: string; mainTerminalId: string }> {
  const prisma = getPrismaClient();
  const config = await requireSuperAdmin(superAdminPassword);

  // A main with satellites of its own must not be demoted out from under them.
  if (config.isMain && (await prisma.pairedTerminal.count()) > 0) {
    throw new Error('settings.cannotDemoteWithSatellites');
  }

  const url = normaliseMainUrl(input.mainTerminalUrl ?? '');
  const probe = await probeMainTerminal(url, config.storeId);
  if (!probe.ok) throw new Error(`settings.mainTerminal_${probe.reason.replace(/-/g, '_')}`);

  // An older main of this till's own lineage is one that has been replaced (§11.3): pairing with it
  // would put a stale source of truth back in charge. A different lineage is allowed — joining
  // another shop's chain, or starting over, is a deliberate act behind this password.
  if (
    config.lanLineage &&
    probe.info.lineage === config.lanLineage &&
    probe.info.generation < config.mainGeneration
  ) {
    throw new Error('settings.mainTerminal_superseded');
  }

  let secret: string;
  let paired: Awaited<ReturnType<typeof pairWithMain>>;
  try {
    paired = await pairWithMain(url, input.code, config.terminalId, input.name);
    if (!paired.secret) throw new Error('no secret in the answer');
    secret = paired.secret;
    // Prove it before believing it. If the secret we were just handed does not work, nothing has
    // been written yet and the till is still exactly what it was.
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
    data: {
      isMain: false,
      mainTerminalUrl: url,
      // This till now belongs to its main's lineage, at its main's generation.
      lanLineage: probe.info.lineage,
      mainGeneration: probe.info.generation,
    },
  });
  await forgetPreviousRole();

  // A satellite serves nothing, so this closes the listener if one was open.
  await syncLocalServerWithMode();

  log.info(`[pairing] now a satellite of ${paired.mainTerminalId} (store ${paired.storeId})`);
  return { storeName: paired.storeName, mainTerminalId: paired.mainTerminalId };
}

/**
 * Point this satellite at its main's new address (§11.6) — after a handoff moved the main role to
 * another till, which this one's pairing travelled to with the database.
 *
 * No code and no re-pairing: the credential this till already holds is what proves the new main
 * is the one it belongs to. Refused unless the address answers as a main of the same shop, in the
 * same lineage at a generation no lower than this till has seen, and accepts that credential.
 */
export async function repointMain(
  superAdminPassword: string,
  mainTerminalUrl: string,
): Promise<{ mainTerminalId: string }> {
  const prisma = getPrismaClient();
  const config = await requireSuperAdmin(superAdminPassword);
  if (config.isMain !== false) throw new Error('settings.repointNotSatellite');

  const url = normaliseMainUrl(mainTerminalUrl ?? '');
  const probe = await probeMainTerminal(url, config.storeId);
  if (!probe.ok) throw new Error(`settings.mainTerminal_${probe.reason.replace(/-/g, '_')}`);

  const { lineage, generation } = probe.info;
  if (config.lanLineage && lineage && lineage !== config.lanLineage) {
    // Another chain of mains: not where this till's pairing went. Pairing with it is the way in.
    throw new Error('settings.repointOtherLineage');
  }
  if (config.lanLineage && lineage === config.lanLineage && generation < config.mainGeneration) {
    throw new Error('settings.mainTerminal_superseded');
  }

  const secret = await prisma.systemSetting.findUnique({ where: { key: DEVICE_SECRET_KEY } });
  try {
    if (!secret?.value) throw new Error('no device secret');
    await fetchTerminalToken(url, config.terminalId, secret.value);
  } catch (err) {
    log.warn(`[pairing] repointing to ${url} failed: ${err instanceof Error ? err.message : err}`);
    const name = (err as { name?: string } | null)?.name;
    if (name === 'TypeError' || name === 'AbortError' || name === 'TimeoutError') {
      throw new Error('settings.mainTerminal_unreachable');
    }
    throw new Error('settings.repointNotPaired');
  }

  await prisma.localConfig.update({
    where: { id: 'config' },
    data: {
      mainTerminalUrl: url,
      lanLineage: lineage ?? config.lanLineage,
      mainGeneration: Math.max(generation, config.mainGeneration ?? 0),
    },
  });
  // A different machine is a different clock: the catalog cursor starts over (§6.5), and the
  // session the old address issued is dead at the new one.
  await forgetPreviousRole();

  log.info(`[pairing] repointed to main ${probe.info.terminalId} at ${url}`);
  return { mainTerminalId: probe.info.terminalId };
}

/**
 * Stop being a satellite and go back to being an independent main — §11.5's emergency promotion.
 *
 * Deliberately local-only: it does not ask the main to forget this terminal, because the usual
 * reason to run it is that the main cannot be reached. Removing the row on the main is a separate
 * act, done from the main (`pairing:remove`).
 *
 * It moves the lineage on (§11.3): this till becomes the next generation, so the main it left — if
 * it comes back from repair still believing it is in charge — is refused by every satellite that
 * has since seen this one. The warning logged is the record §11.5 asks for.
 */
export async function leaveMain(superAdminPassword: string): Promise<void> {
  const prisma = getPrismaClient();
  const config = await requireSuperAdmin(superAdminPassword);

  const lineage = config.lanLineage ?? newLineage();
  const generation = (config.mainGeneration ?? 0) + 1;

  const cursor = await prisma.systemSetting.findUnique({ where: { key: 'last_product_sync' } });
  log.warn(
    `[pairing] ${config.terminalId} left main ${config.mainTerminalUrl ?? '(none)'} at ` +
      `${new Date().toISOString()} and is now an independent main, generation ${generation} of ` +
      `lineage ${lineage}. Its catalog was last pulled up to ${cursor?.value ?? 'never'}; sales ` +
      `rung up at other tills since then are not on it.`,
  );

  await prisma.systemSetting.deleteMany({ where: { key: DEVICE_SECRET_KEY } });
  await prisma.localConfig.update({
    where: { id: 'config' },
    data: { isMain: true, mainTerminalUrl: null, lanLineage: lineage, mainGeneration: generation },
  });
  await forgetPreviousRole();
  await syncLocalServerWithMode();
}
