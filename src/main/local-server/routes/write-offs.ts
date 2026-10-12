import { intParam } from '../helpers';
import { badRequest, forbidden, HttpError, notFound, type Route } from '../router';
import {
  createWriteOff,
  getWriteOff,
  listWriteOffs,
  parseWriteOffInput,
  type WriteOffResult,
} from '../../write-offs/write-offs';

/**
 * Write-offs from the dashboard this terminal serves — an OFFLINE_ONLY store has no server to post
 * them to. Same paths and shapes as the VPS `/write-offs`, so the dashboard page does not care which
 * backend answered. The work is in `write-offs/write-offs.ts`, shared with the POS page.
 */

const ADMIN_ONLY = ['ADMIN', 'SUPER_ADMIN'];

function unwrap<T>(result: WriteOffResult<T>): T {
  if (result.ok) return result.value;
  if (result.status === 403) throw forbidden(result.message);
  if (result.status === 404) throw notFound(result.message);
  throw new HttpError(400, result.message);
}

export const writeOffRoutes: Route[] = [
  {
    method: 'GET',
    path: '/write-offs',
    roles: ADMIN_ONLY,
    handler: async ({ query }) =>
      listWriteOffs({
        search: query.search,
        reason: query.reason,
        page: intParam(query.page),
        limit: intParam(query.limit),
      }),
  },

  {
    method: 'POST',
    path: '/write-offs',
    roles: ADMIN_ONLY,
    handler: async ({ body, user }) => {
      const input = parseWriteOffInput(body);
      if (typeof input === 'string') throw badRequest(input);
      return unwrap(await createWriteOff(input, { id: user!.id }));
    },
  },

  {
    method: 'GET',
    path: '/write-offs/:id',
    roles: ADMIN_ONLY,
    handler: async ({ params }) => unwrap(await getWriteOff(params.id)),
  },
];
