import { db } from '../helpers';
import { notFound, type Route } from '../router';

/**
 * How a satellite works out what it is talking to.
 *
 * `probeApiUrl()` validates a terminal's `apiUrl` by asking the vendor's server for `/health`, and
 * deliberately treats *any* server without that route as the wrong one — which is what stops a
 * till being pointed at another till and silently never syncing. That guard must keep working, so
 * this server does not answer `/health`, and a satellite's `mainTerminalUrl` is validated against
 * this endpoint instead.
 *
 * Two fields, two questions: `apiUrl` asks "is this the vendor's server?", `mainTerminalUrl` asks
 * "is this our main terminal?". Neither answer is a substitute for the other.
 *
 * Public, because a satellite has to reach this before it has any credential — pairing has not
 * happened yet. It therefore says the minimum a satellite needs to decide whether it is at the
 * right machine, and nothing about takings, stock or people.
 */
export const terminalRoutes: Route[] = [
  {
    method: 'GET',
    path: '/terminal/info',
    public: true,
    handler: async () => {
      const config = await db().localConfig.findUnique({ where: { id: 'config' } });
      if (!config) throw notFound('Terminal not configured');

      return {
        // A stable marker to key on, the way `/health` has `status`. Without it a probe would be
        // reading the shape of the payload and guessing.
        service: 'posgro-terminal',
        role: config.isMain ? 'main' : 'satellite',
        // So a satellite can refuse a main belonging to a different shop — a real possibility
        // where two businesses share a building's wifi.
        store_id: config.storeId,
        terminal_id: config.terminalId,
      };
    },
  },
];
