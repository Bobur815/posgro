import * as bcrypt from 'bcryptjs';
import { getPrismaClient } from '../database/sqlite-client';
import { AttemptThrottle } from '../ipc/override-throttle';

/**
 * The super-admin gate for acts that decide which machine owns the shop's data
 * (tasks/LAN_MAIN_TERMINAL_PLAN.md §11.2): pairing and removing tills, joining and leaving a main,
 * handing the main role over, repointing a satellite.
 *
 * Deliberately not the terminal PIN or a store admin's password — `auth:verifyTerminalAccess`, which
 * unlocks the gear dialog, accepts either, and neither is strong enough to hand the shop's stock to
 * another machine. The password is checked on every act rather than trusting an earlier "yes", so
 * a caller cannot verify once and then act forever.
 */

/**
 * One throttle for every role act. They all check the same password on the same machine; separate
 * throttles would only have multiplied the guesses available to someone at the till.
 */
const throttle = new AttemptThrottle();

/** Test seam: forget lockouts between cases. Production never calls this. */
export function __resetSuperAdminThrottle(): void {
  throttle.reset();
}

type LocalConfigRow = NonNullable<
  Awaited<ReturnType<ReturnType<typeof getPrismaClient>['localConfig']['findUnique']>>
>;

/**
 * The terminal's config, once `password` has proved to be its super-admin password. Throws a
 * `settings.*` key otherwise.
 *
 * A store with no super-admin password configured cannot change roles at all, rather than falling
 * back to a weaker gate: a missing configuration must not read as an open door (§11.2).
 */
export async function requireSuperAdmin(password: string): Promise<LocalConfigRow> {
  if (throttle.isLockedOut()) throw new Error('settings.pairingThrottled');

  const config = await getPrismaClient().localConfig.findUnique({ where: { id: 'config' } });
  if (!config) throw new Error('settings.terminalNotConfigured');
  if (!config.superAdminPassword) throw new Error('settings.pairingNeedsSuperAdmin');

  if (!password || !(await bcrypt.compare(password, config.superAdminPassword))) {
    throttle.recordFailure();
    throw new Error('settings.superAdminPasswordWrong');
  }
  throttle.reset();
  return config;
}
