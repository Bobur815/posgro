/**
 * Whether this terminal should be listening on the shop's network.
 *
 * Pure, and separated from `syncLocalServerWithMode()` for the same reason `sync-policy.ts` is
 * separated from the sync loop: the decision is worth testing directly, and the thing it guards
 * is a listening socket on premises that are not ours.
 *
 * Two independent reasons to serve, and they must stay independent:
 *
 *  - an **OFFLINE_ONLY** store has no VPS, so its own terminal serves the dashboard;
 *  - a **main with satellites** has tills to answer, in either mode.
 *
 * `isMain` alone is not one of them. It defaults to true for every terminal in the field
 * (`tasks/LAN_MAIN_TERMINAL_PLAN.md` §10.1), so serving on that would open a port across the whole
 * fleet the day the release lands, in shops that asked for none of it. Paired satellites are the
 * signal that a shop actually wants this: no rows, no server.
 */

export interface ServeConfig {
  mode?: string | null;
  isMain?: boolean | null;
}

export function shouldServeLocally(
  config: ServeConfig | null | undefined,
  pairedTerminalCount: number,
  /**
   * True while a pairing code is outstanding. Without this the feature could never start: the
   * server runs once a satellite is paired, but a satellite has to reach the server in order to
   * pair. Issuing a code opens the door for the few minutes the code lives.
   */
  pairingOpen = false,
): boolean {
  if (config?.mode === 'OFFLINE_ONLY') return true;
  if (config?.isMain !== true) return false;
  return pairedTerminalCount > 0 || pairingOpen;
}
