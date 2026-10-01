/**
 * Endpoints the server has told this till it does not have (404), and when.
 *
 * A till runs ahead of its server during a rollout, and a new sync step aimed at an older server
 * gets a 404 on every cycle. fail2ban's nginx-404 jail on the VPS counts those exactly like a
 * scanner's probes, and every till of a shop shares the shop's IP — so a few tills a few minutes
 * apart can get the whole shop banned. After a 404 the step stays quiet for RECHECK_MS and then asks
 * once more; any other answer clears it.
 *
 * In memory on purpose: a restart asks again once, which is what a newly deployed server needs.
 */

export const RECHECK_MS = 6 * 60 * 60 * 1000;

const missingSince = new Map<string, number>();

/** True while a 404 for this endpoint is recent enough that asking again is pointless. */
export function endpointKnownMissing(key: string, now = Date.now()): boolean {
  const since = missingSince.get(key);
  return since !== undefined && now - since < RECHECK_MS;
}

/** Record what the server answered for this endpoint. */
export function noteEndpointStatus(key: string, status: number, now = Date.now()): void {
  if (status === 404) missingSince.set(key, now);
  else missingSince.delete(key);
}

/** Tests only. */
export function resetMissingEndpoints(): void {
  missingSince.clear();
}
