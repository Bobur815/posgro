import { syncCategories, syncProducts, syncSettings, type PullSource } from '../sync/products-sync';
import { mainRequest } from './main-link';

/**
 * A satellite's sync cycle: refresh the read cache from its main, and report in
 * (tasks/LAN_MAIN_TERMINAL_PLAN.md §5.8, §5.9).
 *
 * Nothing is uploaded — a satellite holds no truth of its own to upload; every sale and shift it
 * made is already on the main, which sends them to the VPS itself. And nothing here ever reaches
 * the VPS: that is the whole of the satellite rule.
 */

/** The main terminal as a catalog source: the same shapes the VPS serves, one hop closer. */
export const mainSource: PullSource = {
  isVps: false,
  async get(resource, query = '') {
    const data = await mainRequest('GET', `/terminal/sync/${resource}${query}`);
    return { ok: true, statusText: 'OK', json: async () => data };
  },
};

/**
 * Categories before products (a product needs its category to exist), then settings, then the
 * heartbeat that tells the main — and the shopkeeper looking at the dashboard — this till is alive.
 *
 * Throws `MainLinkError` when the main cannot be reached; the caller treats that as a quiet
 * cycle, since the reachability banner is already saying it.
 */
export async function syncWithMain(): Promise<{ id: number; nameRu: string; stock: number }[]> {
  await syncCategories(mainSource);
  await syncSettings(mainSource);
  const stockConflicts = await syncProducts(mainSource);
  // Nothing queues on a satellite, so there is never anything unsent to report.
  await mainRequest('POST', '/terminals/heartbeat', { body: { unsyncedCount: 0 } });
  return stockConflicts;
}
