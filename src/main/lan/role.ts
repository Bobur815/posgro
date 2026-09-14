import { getPrismaClient } from '../database/sqlite-client';

/**
 * Whether this terminal is a satellite — every IPC handler that would write the shop's truth asks
 * this first and, if so, hands the work to its main (`satellite-ops.ts`).
 *
 * Read from `local_config` each time rather than cached: it is one indexed row, and a cache would
 * need invalidating from every place the role can change (pairing, leaving, a future promotion).
 * A stale answer here would mean a satellite selling from its own stock, which is the bug the
 * whole design exists to prevent.
 */
export async function isSatellite(): Promise<boolean> {
  const config = await getPrismaClient().localConfig.findUnique({
    where: { id: 'config' },
    select: { isMain: true },
  });
  return config?.isMain === false;
}
