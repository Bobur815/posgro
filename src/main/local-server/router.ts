import type { IncomingMessage, ServerResponse } from 'http';

/**
 * A very small HTTP router.
 *
 * The dashboard talks to a NestJS server in the normal ONLINE deployment; offline it talks to
 * this. Rather than boot Nest inside Electron — its controllers are bound to the PostgreSQL
 * client and a multi-tenant schema neither of which exists here — the handful of things Nest was
 * providing (path params, JSON bodies, guards, status codes) are done directly.
 */

export type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface RequestContext {
  /** Path parameters, e.g. `:id` in `/products/:id`. */
  params: Record<string, string>;
  /** Parsed query string. Repeated keys keep the last value, matching Express. */
  query: Record<string, string>;
  /** Parsed JSON body, or `{}` for a request without one. */
  body: any;
  /** The authenticated user, absent on a `public` route and on a `terminal` one. */
  user?: AuthenticatedUser;
  /** Which satellite is calling, on a `terminal` route. Absent everywhere else. */
  terminal?: { terminalId: string };
  /** Who is signed in at that satellite, on a route that declares `session`. */
  session?: SessionUser;
  req: IncomingMessage;
}

/** A person at a satellite, re-read from the main's own `users` table on every request. */
export interface SessionUser {
  id: string;
  phone: string;
  role: string;
  nameRu: string;
  nameUz: string;
}

/**
 * The header a satellite sends its user session in. Separate from `Authorization`, which carries
 * the device token: every person-level request needs both, the till *and* the person at it.
 */
export const SESSION_HEADER = 'x-user-session';

/**
 * The 401 message for a missing or dead session — distinct from a dead device token, because the
 * satellite's answers differ: a device token it simply renews; a session means someone has to sign
 * in again.
 */
export const SESSION_REQUIRED = 'SESSION_REQUIRED';

export interface AuthenticatedUser {
  id: string;
  phone: string;
  role: string;
}

export type Handler = (ctx: RequestContext) => Promise<unknown> | unknown;

export interface Route {
  method: Method;
  /** Pattern with `:name` placeholders, e.g. `/products/:id`. */
  path: string;
  handler: Handler;
  /** Skip the auth guard. Only login and other pre-auth endpoints set this. */
  public?: boolean;
  /** Restrict to these roles. Omitted means any authenticated user. */
  roles?: string[];
  /**
   * Which credential this route accepts. Omitted means the dashboard's — every route that existed
   * before satellites did.
   *
   * `terminal` routes are driven by a paired satellite and are closed to the browser, so a phone
   * on the shop wifi cannot reach them even with a valid dashboard login. The reverse holds too:
   * a satellite's device token opens nothing a person would use.
   */
  audience?: 'web' | 'terminal';
  /**
   * On a `terminal` route: also require a signed-in person at that satellite (`SESSION_HEADER`),
   * issued to that same terminal, for a user who is still active here. Anything a cashier does —
   * selling, opening a shift, changing their PIN — declares this.
   */
  session?: boolean;
  /**
   * Answered while a handoff holds the write freeze (§11.4). Every other non-GET route is refused
   * then with `MAIN_HANDING_OFF`: the new main's copy of the database is being taken, and a write
   * that lands after it is lost. Set on the routes a satellite needs to stay connected (its token,
   * signing in, its heartbeat) — whose writes are bookkeeping nothing depends on — and on the
   * handoff's own.
   */
  duringHandoff?: boolean;
}

/**
 * A handler's answer that is a file, not JSON — streamed rather than read into memory, since the
 * one user of it is a whole database (§11.4). `cleanup` runs once the response has finished or the
 * connection dropped, for a file that exists only to be sent.
 */
export class FileReply {
  constructor(
    readonly path: string,
    readonly cleanup?: () => void,
  ) {}
}

/**
 * An error carrying the status the client should see.
 *
 * Anything else thrown by a handler becomes a 500 with a generic message, so an internal failure
 * cannot leak a stack trace or a file path onto the shop's network.
 */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

export const badRequest = (m: string) => new HttpError(400, m);
export const unauthorized = (m = 'Unauthorized') => new HttpError(401, m);
export const forbidden = (m = 'Access denied') => new HttpError(403, m);
export const notFound = (m = 'Not found') => new HttpError(404, m);
/** For endpoints that exist but cannot work without the VPS — the UI shows the reason. */
export const unavailable = (m: string) => new HttpError(503, m);

interface CompiledRoute extends Route {
  segments: string[];
}

export class Router {
  private readonly routes: CompiledRoute[] = [];

  add(routes: Route[]): this {
    for (const route of routes) {
      this.routes.push({ ...route, segments: split(route.path) });
    }
    return this;
  }

  /**
   * Find the route for a request.
   *
   * Returns `matchedPath: false` when no route has this path at all (a 404) and true when the
   * path exists under a different method (a 405) — the distinction the SPA needs to tell "you
   * built an old client" from "you called it wrong".
   */
  match(
    method: string,
    pathname: string,
  ): { route: CompiledRoute; params: Record<string, string> } | { matchedPath: boolean } {
    const segments = split(pathname);
    let matchedPath = false;

    for (const route of this.routes) {
      const params = matchSegments(route.segments, segments);
      if (!params) continue;
      matchedPath = true;
      if (route.method === method) return { route, params };
    }

    return { matchedPath };
  }
}

function split(path: string): string[] {
  return path.split('/').filter(Boolean);
}

/** Match a compiled pattern against a request path, returning its params or null. */
function matchSegments(pattern: string[], actual: string[]): Record<string, string> | null {
  if (pattern.length !== actual.length) return null;

  const params: Record<string, string> = {};
  for (let i = 0; i < pattern.length; i++) {
    const expected = pattern[i];
    if (expected.startsWith(':')) {
      // A path parameter arrives percent-encoded; a barcode or MXIK code may legitimately
      // contain characters that need it.
      params[expected.slice(1)] = safeDecode(actual[i]);
      continue;
    }
    if (expected !== actual[i]) return null;
  }
  return params;
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    // A malformed escape is not worth a 400 — pass the raw segment through.
    return value;
  }
}

/** Write a JSON response. `undefined` from a handler becomes 204, matching Nest's behaviour. */
export function sendJson(res: ServerResponse, status: number, payload: unknown): void {
  if (payload === undefined) {
    res.writeHead(204).end();
    return;
  }
  const body = JSON.stringify(payload ?? null);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

/** Nest's error envelope, which the SPA's axios interceptor reads `message` out of. */
export function sendError(res: ServerResponse, status: number, message: string): void {
  sendJson(res, status, { statusCode: status, message });
}
