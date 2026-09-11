import type { Route } from '../router';
import { abortHandoff, beginHandoff, completeHandoff, snapshotDatabase } from '../handoff';

/**
 * A planned handoff of the main role (tasks/LAN_MAIN_TERMINAL_PLAN.md §11.4), driven by the
 * satellite taking over — see `../handoff.ts` for the protocol.
 *
 * All three are terminal routes: only a till already paired with this main can take it over, and
 * the handoff code proves the person at the main agreed. The token `begin` returns ties the other
 * two to that same till.
 */

/** The handoff token travels in a header, so it never ends up in a URL or a log line. */
export const HANDOFF_HEADER = 'x-handoff-token';

function handoffToken(headers: Record<string, string | string[] | undefined>): string | undefined {
  const raw = headers[HANDOFF_HEADER];
  return Array.isArray(raw) ? raw[0] : raw;
}

export const handoffRoutes: Route[] = [
  {
    method: 'POST',
    path: '/terminal/handoff/begin',
    audience: 'terminal',
    handler: ({ body, terminal }) => beginHandoff(body?.code, terminal!.terminalId),
  },
  {
    method: 'GET',
    path: '/terminal/handoff/database',
    audience: 'terminal',
    handler: ({ req, terminal }) => snapshotDatabase(handoffToken(req.headers), terminal!.terminalId),
  },
  {
    method: 'POST',
    path: '/terminal/handoff/complete',
    audience: 'terminal',
    duringHandoff: true,
    handler: ({ req, body, terminal }) =>
      completeHandoff(handoffToken(req.headers), terminal!.terminalId, body),
  },
  {
    method: 'POST',
    path: '/terminal/handoff/abort',
    audience: 'terminal',
    duringHandoff: true,
    handler: ({ req, terminal }) => abortHandoff(handoffToken(req.headers), terminal!.terminalId),
  },
];
