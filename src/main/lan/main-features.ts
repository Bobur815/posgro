/**
 * What this till's main terminal can do, as its heartbeat reply says — so a satellite never offers
 * something an older main would quietly mishandle.
 *
 * Split payment is the first: an older main ignores the `payments` lines of a sale, so a split sale
 * committed there would be stored without them and every drawer figure would be wrong. A main that
 * sends no `features` (an older build) supports none of them.
 *
 * In memory on purpose, like missing-endpoints: the first heartbeat after a restart fills it, and
 * until then a satellite errs on the side of the old behaviour.
 */

/** Features this build's main serves. Sent in the heartbeat reply (local-server terminal.ts). */
export const MAIN_FEATURES = ['split-payment'] as const;
export type MainFeature = (typeof MAIN_FEATURES)[number];

let known = new Set<string>();

/** Record the `features` of a heartbeat reply; anything not a string list means none. */
export function noteMainFeatures(features: unknown): void {
  known = new Set(Array.isArray(features) ? features.filter((f) => typeof f === 'string') : []);
}

export function mainHas(feature: MainFeature): boolean {
  return known.has(feature);
}
