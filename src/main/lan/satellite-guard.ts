import { isSatellite } from './role';

/**
 * Refuse a write that only the main terminal may make (tasks/LAN_MAIN_TERMINAL_PLAN.md §4, §5.9).
 *
 * A satellite's catalog, suppliers, users and settings are a read cache of its main's. Writing to
 * them here would change nothing that matters — the next pull overwrites it, and the main never
 * hears of it — while the cashier believes it worked. Phase 4 hides the buttons that lead here;
 * this is what makes a button that was missed harmless rather than a quiet divergence.
 *
 * The same JSON shape as a sale refusal, so the renderer's existing error parsing names it.
 */
export async function assertNotSatellite(): Promise<void> {
  if (await isSatellite()) {
    throw new Error(JSON.stringify({ code: 'SATELLITE_READ_ONLY' }));
  }
}
