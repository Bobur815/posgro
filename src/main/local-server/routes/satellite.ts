import * as bcrypt from 'bcryptjs';
import { db, required } from '../helpers';
import { authenticate, publicUser, signSessionToken } from '../auth';
import {
  HttpError,
  badRequest,
  forbidden,
  notFound,
  type RequestContext,
  type Route,
} from '../router';
import { AttemptThrottle } from '../../ipc/override-throttle';
import { findUserIdByPin, hashNewPin, usersWithPin } from '../../auth/pin';
import { commitSale, deleteSale, SaleRefusedError, updateSale } from '../../sales/commit-sale';
import { settleSale } from '../../sales/settle-sale';
import {
  addShiftMovement,
  closeShift,
  currentShift,
  openShift,
  shiftHistory,
  shiftReport,
} from '../../sales/shifts';
import { regosVcrService } from '../../fiscal/regos-vcr-service';
import { LOCAL_ONLY_SETTINGS } from '../../sync/local-only-settings';
import { log } from '../../logger';

/**
 * What a main terminal answers its satellites (tasks/LAN_MAIN_TERMINAL_PLAN.md §5.3–§5.14).
 *
 * Every route is the terminal audience, and the terminal id always comes from the device token,
 * never from a body — the precedent the heartbeat set. Anything a person does also declares
 * `session`, so the main checks who is at the till as well as which till it is.
 *
 * Errors carry the codes the satellite's renderer already understands: `auth.errors.*` keys for
 * login, and the JSON refusals `commitSale` throws for a sale. The satellite re-throws them as they
 * arrive, so a cashier at a satellite sees exactly the message they would see at the main.
 */

/** How long a satellite's sale waits for its fiscal QR before being answered without one (§6.8). */
const FISCAL_WAIT_MS = 10_000;

/**
 * One throttle per satellite (§6.10). A PIN is at most four digits and, answered here, is a
 * network credential — and each wrong guess costs a bcrypt compare per user with a PIN, so an
 * unthrottled guesser is also a denial of service against the terminal that runs the whole shop.
 * Per terminal, so one till being hammered does not lock every other till out.
 */
const pinThrottles = new Map<string, AttemptThrottle>();

function pinThrottleFor(terminalId: string): AttemptThrottle {
  let throttle = pinThrottles.get(terminalId);
  if (!throttle) {
    throttle = new AttemptThrottle(5, 60_000);
    pinThrottles.set(terminalId, throttle);
  }
  return throttle;
}

/** Test seam: forget lockouts between cases. Production never calls this. */
export function __resetPinThrottles(): void {
  pinThrottles.clear();
}

/** The session a login hands back: the person, and the token that proves it on later requests. */
function sessionFor(user: Parameters<typeof publicUser>[0], terminalId: string) {
  return { user: publicUser(user), session: signSessionToken(user.id, terminalId) };
}

/**
 * Translate what the shared domain code throws into a status the satellite can act on.
 *
 * A refusal keeps its JSON message verbatim so the satellite's renderer parses it exactly as it
 * parses a local one; known plain messages get a status; anything else stays a 500 whose message
 * never leaves this machine.
 */
async function answering<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof HttpError) throw err;
    if (err instanceof SaleRefusedError) throw new HttpError(409, err.message);
    const message = err instanceof Error ? err.message : '';
    if (message === 'Unauthorized') throw forbidden('Unauthorized');
    if (message === 'Sale not found') throw notFound(message);
    if (message === 'SMENA_ALREADY_OPEN' || message === 'SMENA_NOT_OPEN') {
      throw new HttpError(409, message);
    }
    if (message.startsWith('auth.errors.')) throw badRequest(message);
    throw err;
  }
}

/** Resolve after the fiscalization or after `ms`, whichever comes first. Never throws. */
async function waitAtMost(promise: Promise<void> | null, ms: number): Promise<void> {
  if (!promise) return;
  let timer: NodeJS.Timeout | undefined;
  await Promise.race([
    promise,
    new Promise<void>((resolve) => {
      timer = setTimeout(resolve, ms);
    }),
  ]);
  clearTimeout(timer);
}

/**
 * The sale as this main understands it: every line pointed at *this* database's product.
 *
 * A satellite names each line's product by its canonical barcode (`productBarcode`), never by id.
 * Its ids are its own: a till that was independent before it was paired keeps its local id for a
 * product whose id was taken when the catalog arrived (products-sync falls back to autoincrement),
 * so the same number can mean a different product here — and selling the wrong product is worse
 * than refusing. Barcodes are unique on both sides and mean the same thing on both.
 */
async function onThisMain(body: any): Promise<any> {
  if (!Array.isArray(body?.items) || body.items.length === 0) {
    throw badRequest('items should not be empty');
  }
  required(body?.paymentMethod, 'paymentMethod');

  const barcodes: string[] = body.items.map((item: any) =>
    String(required(item?.productBarcode, 'productBarcode')),
  );
  const rows = await db().product.findMany({
    where: { barcode: { in: [...new Set(barcodes)] } },
    select: { id: true, barcode: true },
  });
  const idByBarcode = new Map(rows.map((r) => [r.barcode, r.id]));

  const items = body.items.map((item: any, i: number) => {
    const productId = idByBarcode.get(barcodes[i]);
    if (productId === undefined) {
      throw new SaleRefusedError({ code: 'PRODUCT_NOT_FOUND', productId: barcodes[i] });
    }
    return { ...item, productId };
  });
  return { ...body, items };
}

/** The acting person, for a route that declares `session` — the router guarantees it is there. */
function person(ctx: RequestContext) {
  return ctx.session!;
}

export const satelliteRoutes: Route[] = [
  // ── Login (§5.13, §6.9, §6.10) ────────────────────────────────────────────────────────────────

  /**
   * Password login for someone at a satellite. The same `users` table and bcrypt hashes as the
   * dashboard login, with its per-phone throttle — only the credential it hands back differs.
   */
  {
    method: 'POST',
    path: '/terminal/auth/login',
    audience: 'terminal',
    handler: async ({ body, terminal }) => {
      const phone = String(required(body?.phone, 'phone'));
      const password = String(required(body?.password, 'password'));
      try {
        const user = await authenticate(phone, password);
        return sessionFor(user, terminal!.terminalId);
      } catch (err) {
        // The satellite's login screen speaks auth.errors.* keys; say the same thing it would say
        // locally rather than the dashboard's English.
        if (err instanceof HttpError && err.status === 403) {
          throw forbidden('auth.errors.user_deactivated');
        }
        if (err instanceof HttpError && err.status === 401) {
          throw new HttpError(401, 'auth.errors.invalid_password');
        }
        throw err;
      }
    },
  },

  /** Whether PIN login is offered at all — asked by the login screen before anyone signs in. */
  {
    method: 'GET',
    path: '/terminal/auth/pin-configured',
    audience: 'terminal',
    handler: async () => ({ configured: (await usersWithPin(db())).length > 0 }),
  },

  /**
   * PIN login, shipped with the mitigations §6.10 requires rather than after them: only a paired
   * device can ask at all (the audience), each device has its own lockout, and every wrong guess is
   * logged against the terminal it came from so a shop can see it happening.
   */
  {
    method: 'POST',
    path: '/terminal/auth/pin',
    audience: 'terminal',
    handler: async ({ body, terminal }) => {
      const terminalId = terminal!.terminalId;
      const throttle = pinThrottleFor(terminalId);
      if (throttle.isLockedOut()) {
        log.warn(`[lan-auth] PIN attempt refused — terminal ${terminalId} is locked out`);
        throw new HttpError(429, 'auth.errors.pin_locked');
      }

      const pin = String(body?.pin ?? '');
      // Nobody having a PIN is a different answer from a wrong one: the satellite's login screen
      // uses it to fall back to phone + password instead of showing an error.
      if ((await usersWithPin(db())).length === 0) {
        throw new HttpError(409, 'auth.errors.pin_not_configured');
      }

      const userId = await findUserIdByPin(db(), pin);
      const user = userId ? await db().user.findUnique({ where: { id: userId } }) : null;
      if (!user) {
        throttle.recordFailure();
        log.warn(`[lan-auth] wrong PIN from terminal ${terminalId}`);
        throw new HttpError(401, 'auth.errors.invalid_pin');
      }
      if (!user.active) throw forbidden('auth.errors.user_deactivated');

      throttle.reset();
      return sessionFor(user, terminalId);
    },
  },

  /** Is this session still good? A satellite asks when it restores a session after a restart. */
  {
    method: 'GET',
    path: '/terminal/auth/session',
    audience: 'terminal',
    session: true,
    handler: async (ctx) => ({ user: person(ctx) }),
  },

  {
    method: 'GET',
    path: '/terminal/auth/has-pin',
    audience: 'terminal',
    session: true,
    handler: async (ctx) => {
      const row = await db().user.findUnique({ where: { id: person(ctx).id }, select: { pin: true } });
      return { hasPin: Boolean(row?.pin) };
    },
  },

  /** Set the signed-in person's own PIN — on the main, where PIN login is checked. */
  {
    method: 'POST',
    path: '/terminal/auth/pin/setup',
    audience: 'terminal',
    session: true,
    handler: (ctx) =>
      answering(async () => {
        const pin = String(ctx.body?.pin ?? '');
        const hashed = await hashNewPin(db(), pin, person(ctx).id);
        await db().user.update({ where: { id: person(ctx).id }, data: { pin: hashed } });
        return { ok: true };
      }),
  },

  {
    method: 'DELETE',
    path: '/terminal/auth/pin',
    audience: 'terminal',
    session: true,
    handler: async (ctx) => {
      await db().user.update({ where: { id: person(ctx).id }, data: { pin: null } });
      return { ok: true };
    },
  },

  {
    method: 'POST',
    path: '/terminal/auth/change-password',
    audience: 'terminal',
    session: true,
    handler: async (ctx) => {
      const currentPassword = String(required(ctx.body?.currentPassword, 'currentPassword'));
      const newPassword = String(required(ctx.body?.newPassword, 'newPassword'));
      const row = await db().user.findUnique({ where: { id: person(ctx).id } });
      if (!row || !(await bcrypt.compare(currentPassword, row.password))) {
        throw new HttpError(401, 'auth.errors.invalid_password');
      }
      await db().user.update({
        where: { id: row.id },
        data: { password: await bcrypt.hash(newPassword, 10) },
      });
      return { ok: true };
    },
  },

  // ── Sales (§5.5, §5.6, §5.11, §5.12) ──────────────────────────────────────────────────────────

  /**
   * Commit a satellite's sale: stock, receipt number and shift here, in the same queue as this
   * till's own sales; then the fiscal step, whose QR is waited for — briefly — so it can travel
   * back and be printed at the satellite (§5.12). A fiscalization still running when the wait ends
   * carries on here; the sale comes back PENDING and still prints, fiscal or not (§6.8).
   *
   * The satellite supplies the sale id, which makes this safe to retry: a commit whose response was
   * lost comes back as the same receipt, and nothing is sold twice.
   */
  {
    method: 'POST',
    path: '/terminal/sales',
    audience: 'terminal',
    session: true,
    handler: (ctx) =>
      answering(async () => {
        const input = await onThisMain(ctx.body);
        const terminalId = ctx.terminal!.terminalId;
        const who = person(ctx);

        const { sale, stock, replayed } = await commitSale(input, {
          terminalId,
          cashierId: who.id,
          cashierName: who.nameRu,
        });

        if (!replayed) {
          const { fiscalizing } = await settleSale(sale.id, input, terminalId);
          await waitAtMost(fiscalizing, FISCAL_WAIT_MS);
        }

        const settled = await db().sale.findUnique({ where: { id: sale.id }, include: { items: true } });
        return { sale: settled, stock, replayed };
      }),
  },

  {
    method: 'PUT',
    path: '/terminal/sales/:id',
    audience: 'terminal',
    session: true,
    handler: (ctx) =>
      answering(async () => {
        const input = await onThisMain(ctx.body);
        const terminalId = ctx.terminal!.terminalId;
        const who = person(ctx);

        const { stock } = await updateSale(ctx.params.id, input, {
          userId: who.id,
          phone: who.phone,
          role: who.role,
          terminalId,
        });

        const { fiscalizing } = await settleSale(ctx.params.id, input, terminalId);
        await waitAtMost(fiscalizing, FISCAL_WAIT_MS);

        const settled = await db().sale.findUnique({
          where: { id: ctx.params.id },
          include: { items: true },
        });
        return { sale: settled, stock, replayed: false };
      }),
  },

  {
    method: 'DELETE',
    path: '/terminal/sales/:id',
    audience: 'terminal',
    session: true,
    handler: (ctx) =>
      answering(async () => {
        const who = person(ctx);
        const sale = await deleteSale(ctx.params.id, {
          userId: who.id,
          phone: who.phone,
          role: who.role,
          terminalId: ctx.terminal!.terminalId,
        });
        return { deleted: true, id: sale.id };
      }),
  },

  // ── Shifts (§5.14) ────────────────────────────────────────────────────────────────────────────

  {
    method: 'GET',
    path: '/terminal/smena/current',
    audience: 'terminal',
    session: true,
    // `{ smena }`, not the bare shift: a JSON `null` body would be indistinguishable from an empty
    // response to a client that treats 204 as "nothing to say".
    handler: async (ctx) => ({ smena: await currentShift(ctx.terminal!.terminalId) }),
  },

  {
    method: 'POST',
    path: '/terminal/smena/open',
    audience: 'terminal',
    session: true,
    handler: (ctx) =>
      answering(() =>
        openShift(ctx.terminal!.terminalId, person(ctx), Number(ctx.body?.initialCash ?? 0)),
      ),
  },

  {
    method: 'POST',
    path: '/terminal/smena/movement',
    audience: 'terminal',
    session: true,
    handler: (ctx) =>
      answering(() => {
        const type = ctx.body?.type;
        if (type !== 'PAY_IN' && type !== 'PAY_OUT') throw badRequest('type must be PAY_IN or PAY_OUT');
        return addShiftMovement(
          {
            smenaId: String(required(ctx.body?.smenaId, 'smenaId')),
            type,
            amount: Number(ctx.body?.amount ?? 0),
            note: ctx.body?.note,
          },
          ctx.terminal!.terminalId,
        );
      }),
  },

  /**
   * Close a satellite's shift. The VCR's Z-report is deliberately left alone: it is the device's
   * report and belongs to the main's own shift — closing it here would close it under every other
   * till still selling. Pending fiscalizations are nudged in the background so the close answers
   * at once.
   */
  {
    method: 'POST',
    path: '/terminal/smena/close',
    audience: 'terminal',
    session: true,
    handler: (ctx) =>
      answering(async () => {
        const result = await closeShift(
          String(required(ctx.body?.smenaId, 'smenaId')),
          Number(ctx.body?.finalCash ?? 0),
          ctx.terminal!.terminalId,
        );
        void regosVcrService.processPending().catch((err) =>
          console.error('[local-server] processPending after satellite close failed:', err),
        );
        return result;
      }),
  },

  /** A shift and its figures, for the satellite to print its own Z- or X-report. */
  {
    method: 'GET',
    path: '/terminal/smena/:id/report',
    audience: 'terminal',
    session: true,
    handler: async (ctx) => {
      const report = await shiftReport(ctx.params.id, ctx.terminal!.terminalId);
      if (!report) throw notFound('Smena not found');
      return report;
    },
  },

  {
    method: 'GET',
    path: '/terminal/smena/history',
    audience: 'terminal',
    session: true,
    handler: async (ctx) => {
      const limit = Number(ctx.query.limit);
      return shiftHistory(
        ctx.terminal!.terminalId,
        Number.isInteger(limit) && limit > 0 ? Math.min(limit, 200) : 50,
      );
    },
  },

  // ── Catalog pull (§5.8, §6.5) ─────────────────────────────────────────────────────────────────
  // Device-level: a satellite refreshes its read cache whether or not anyone is signed in, so a
  // price lookup still works after the main goes away (§5.9). Same shapes the VPS serves, so the
  // satellite parses them with the code it already has.

  /**
   * Products changed since `updatedAfter`, oldest first. The cursor is this main's own `updatedAt`
   * — the satellite advances it by the values it receives, never by its own clock (§6.5).
   */
  {
    method: 'GET',
    path: '/terminal/sync/products',
    audience: 'terminal',
    handler: async ({ query }) => {
      const since = query.updatedAfter ? new Date(query.updatedAfter) : null;
      if (since && Number.isNaN(since.getTime())) throw badRequest('Invalid updatedAfter');
      return db().product.findMany({
        where: since ? { updatedAt: { gt: since } } : {},
        include: { category: { select: { nameUz: true } } },
        orderBy: { updatedAt: 'asc' },
      });
    },
  },

  /** Every category, inactive ones included — products still point at them. */
  {
    method: 'GET',
    path: '/terminal/sync/categories',
    audience: 'terminal',
    handler: async () => db().category.findMany({ orderBy: { id: 'asc' } }),
  },

  /** The store's settings, minus everything that belongs to this machine alone. */
  {
    method: 'GET',
    path: '/terminal/sync/settings',
    audience: 'terminal',
    handler: async () => {
      const rows = await db().systemSetting.findMany();
      return Object.fromEntries(
        rows.filter((r) => !LOCAL_ONLY_SETTINGS.has(r.key)).map((r) => [r.key, r.value]),
      );
    },
  },
];
