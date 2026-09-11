import * as bcrypt from 'bcryptjs';
import { db, required } from '../helpers';
import { badRequest, forbidden, notFound, unauthorized, type Route } from '../router';
import { AttemptThrottle } from '../../ipc/override-throttle';
import { generateDeviceSecret, redeemPairingCode } from '../pairing';
import { signTerminalToken } from '../auth';

/**
 * A six-digit code is only safe with something in front of it. bcrypt does not help here — the
 * code is compared as a string — so this is the whole defence against someone on the shop wifi
 * walking the keyspace.
 */
const pairingThrottle = new AttemptThrottle();

/** Separate from the pairing throttle: a wrong secret and a wrong code are different mistakes. */
const tokenThrottle = new AttemptThrottle();

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
        // So a satellite can refuse a main that has been replaced (§11.3) — checked again at every
        // token, but a till about to pair needs it before it has one.
        lineage: config.lanLineage ?? null,
        generation: config.mainGeneration ?? 0,
      };
    },
  },

  /**
   * Redeem a pairing code for this satellite's device credential.
   *
   * Public because a satellite has nothing to authenticate with yet — the code *is* the
   * authentication, which is why it is single-use, expires in minutes, and sits behind a throttle.
   *
   * The secret is returned exactly once and stored only as a bcrypt hash, so a main terminal whose
   * database is later copied cannot be used to impersonate its own satellites.
   */
  {
    method: 'POST',
    path: '/terminal/pair',
    public: true,
    handler: async ({ body }) => {
      if (pairingThrottle.isLockedOut()) {
        throw forbidden('Too many attempts. Wait a minute and try again.');
      }

      const code = String(required(body?.code, 'code'));
      const terminalId = String(required(body?.terminalId, 'terminalId')).trim();
      if (!terminalId) throw badRequest('terminalId must not be empty');

      const config = await db().localConfig.findUnique({ where: { id: 'config' } });
      if (!config) throw notFound('Terminal not configured');

      // A satellite cannot pair with a satellite: the row it would create is meaningless, and the
      // shop would end up with a terminal pointed at something that owns nothing.
      if (!config.isMain) throw forbidden('This terminal is not a main terminal');

      // Duplicate ids mean duplicate receipt numbers (§6.2), and the main's own id is the one most
      // likely to be typed by mistake when cloning a machine.
      if (terminalId === config.terminalId) {
        throw badRequest('That terminal id belongs to the main terminal');
      }

      if (!redeemPairingCode(code)) {
        pairingThrottle.recordFailure();
        throw forbidden('Pairing code is wrong or has expired');
      }
      pairingThrottle.reset();

      const secret = generateDeviceSecret();
      const secretHash = await bcrypt.hash(secret, 10);
      const name = typeof body?.name === 'string' ? body.name.trim() || null : null;

      // Upsert rather than create: re-pairing a till that was wiped and reinstalled is ordinary,
      // and it already required a fresh code to get here.
      await db().pairedTerminal.upsert({
        where: { terminalId },
        update: { secretHash, name, pairedAt: new Date() },
        create: { terminalId, secretHash, name },
      });

      return {
        // The only time this is ever readable. The satellite stores it; the main keeps the hash.
        secret,
        store_id: config.storeId,
        store_name: config.storeName,
        main_terminal_id: config.terminalId,
      };
    },
  },

  /**
   * Exchange the device secret for a short-lived terminal token.
   *
   * Public in the router's sense — the secret in the body *is* the credential. Every other
   * terminal route then takes the token, so the secret crosses the wire once an hour rather than
   * on every request.
   *
   * Also where a satellite finds out it has been unpaired: the row is gone, so it gets a 401 and
   * stops, rather than carrying on against a main that no longer recognises it.
   */
  {
    method: 'POST',
    path: '/terminal/token',
    public: true,
    handler: async ({ body }) => {
      if (tokenThrottle.isLockedOut()) {
        throw forbidden('Too many attempts. Wait a minute and try again.');
      }

      const terminalId = String(required(body?.terminalId, 'terminalId')).trim();
      const secret = String(required(body?.secret, 'secret'));

      const row = await db().pairedTerminal.findUnique({ where: { terminalId } });
      // Same answer whether the terminal is unknown or the secret is wrong: which of the two it
      // was is not something an unauthenticated caller should be able to learn.
      if (!row || !(await bcrypt.compare(secret, row.secretHash))) {
        tokenThrottle.recordFailure();
        throw unauthorized('Unknown terminal or wrong secret');
      }
      tokenThrottle.reset();

      await db().pairedTerminal.update({
        where: { terminalId },
        data: { lastSeenAt: new Date() },
      });

      // Where this main stands in its lineage (§11.3). A satellite checks it with every token it
      // takes — which is every hour, at every start, and whenever a different machine answering at
      // this address fails to recognise its token — and refuses a main that has been replaced.
      const config = await db().localConfig.findUnique({ where: { id: 'config' } });
      return {
        token: signTerminalToken(terminalId),
        terminal_id: terminalId,
        lineage: config?.lanLineage ?? null,
        generation: config?.mainGeneration ?? 0,
      };
    },
  },

  /**
   * A satellite confirming its credential still works — and the first route to use the terminal
   * audience, so the split is exercised rather than merely declared.
   */
  {
    method: 'GET',
    path: '/terminal/whoami',
    audience: 'terminal',
    handler: async ({ terminal }) => ({ terminal_id: terminal?.terminalId ?? null }),
  },

  /**
   * A satellite reporting in, mirroring `POST /terminals/heartbeat` on the VPS so one client
   * implementation serves both hops (§5.3).
   *
   * One deliberate difference: **the terminal id comes from the token, not the body.** The VPS
   * takes it from the payload and leans on its store guard; here the caller is a machine on a shop
   * network, and nothing should let one till file a heartbeat as another — which would make a
   * stalled terminal look healthy, the exact failure this is meant to reveal.
   */
  {
    method: 'POST',
    path: '/terminals/heartbeat',
    audience: 'terminal',
    handler: async ({ body, terminal }) => {
      const terminalId = terminal!.terminalId;

      const raw = Number(body?.unsyncedCount);
      const unsyncedCount = Number.isFinite(raw) && raw >= 0 ? Math.floor(raw) : 0;

      // A satellite unpaired between getting its token and using it has no row to update; say so
      // rather than recreating one and letting a removed till quietly re-register itself.
      const existing = await db().pairedTerminal.findUnique({ where: { terminalId } });
      if (!existing) throw unauthorized('This terminal is no longer paired');

      await db().pairedTerminal.update({
        where: { terminalId },
        data: { lastSeenAt: new Date(), unsyncedCount },
      });

      return { ok: true };
    },
  },

  /**
   * Terminal health for the dashboard, in the same shape the VPS returns.
   *
   * The **dashboard** audience, not the terminal one: this is for a person looking at the shop,
   * and a satellite has no business enumerating its siblings.
   */
  {
    method: 'GET',
    path: '/terminals/status',
    handler: async () => {
      const rows = await db().pairedTerminal.findMany({ orderBy: { terminalId: 'asc' } });
      return rows.map((r) => ({
        terminalId: r.terminalId,
        name: r.name,
        // Null until the satellite has reported once — distinct from "reported zero", which is a
        // till that is up to date.
        lastSyncAt: r.lastSeenAt ? r.lastSeenAt.toISOString() : null,
        unsyncedCount: r.unsyncedCount,
      }));
    },
  },
];
