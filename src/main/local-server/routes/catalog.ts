import { db, intParam, required } from '../helpers';
import { badRequest, forbidden, notFound, type Route } from '../router';
import { LOCAL_ONLY_SETTINGS } from '../../sync/local-only-settings';

/** Categories and settings — the two smallest domains, kept together. */

export const categoryRoutes: Route[] = [
  {
    method: 'GET',
    path: '/categories',
    handler: () => db().category.findMany({ where: { active: true }, orderBy: { nameRu: 'asc' } }),
  },

  {
    method: 'POST',
    path: '/categories',
    roles: ['ADMIN', 'SUPER_ADMIN'],
    handler: ({ body }) =>
      db().category.create({
        data: {
          nameRu: String(required(body?.nameRu, 'nameRu')),
          nameUz: String(required(body?.nameUz, 'nameUz')),
          mxikGroupCode: body?.mxikGroupCode ?? null,
        },
      }),
  },

  {
    method: 'PUT',
    path: '/categories/:id',
    roles: ['ADMIN', 'SUPER_ADMIN'],
    handler: async ({ params, body }) => {
      const id = intParam(params.id);
      if (id === undefined) throw badRequest('Invalid category id');
      const data: Record<string, unknown> = {};
      for (const key of ['nameRu', 'nameUz', 'mxikGroupCode', 'active'] as const) {
        if (body?.[key] !== undefined) data[key] = body[key];
      }
      return db().category.update({ where: { id }, data });
    },
  },

  {
    method: 'DELETE',
    path: '/categories/:id',
    roles: ['ADMIN', 'SUPER_ADMIN'],
    handler: async ({ params }) => {
      const id = intParam(params.id);
      if (id === undefined) throw badRequest('Invalid category id');
      // Soft delete: products still reference the category, and past receipts must keep
      // rendering the name they were sold under.
      await db().category.update({ where: { id }, data: { active: false } });
      return { success: true };
    },
  },
];

/**
 * Keys this machine keeps to itself are invisible to the dashboard, exactly as they are on the VPS
 * — which never receives them, so the dashboard has never needed them.
 *
 * Without this, any signed-in dashboard user (a cashier included) could read the stored VPS token,
 * the encrypted fiscal password, and the key LAN tokens are signed with — and an admin could
 * overwrite that key and mint tokens at will.
 */
function assertShareable(key: string): void {
  if (LOCAL_ONLY_SETTINGS.has(key)) throw forbidden('This setting belongs to the terminal');
}

export const settingsRoutes: Route[] = [
  {
    method: 'GET',
    path: '/settings',
    handler: async () => {
      const rows = await db().systemSetting.findMany();
      return Object.fromEntries(
        rows.filter((r) => !LOCAL_ONLY_SETTINGS.has(r.key)).map((r) => [r.key, r.value]),
      );
    },
  },

  {
    method: 'GET',
    path: '/settings/:key',
    handler: async ({ params }) => {
      // Reads as absent rather than 403, the same answer the VPS gives for a key it never holds.
      if (LOCAL_ONLY_SETTINGS.has(params.key)) return { key: params.key, value: null };
      const row = await db().systemSetting.findUnique({ where: { key: params.key } });
      // The dashboard reads `data.value`, so a missing key is a null value, not a 404.
      return { key: params.key, value: row?.value ?? null };
    },
  },

  {
    method: 'PUT',
    path: '/settings/:key',
    roles: ['ADMIN', 'SUPER_ADMIN'],
    handler: async ({ params, body }) => {
      assertShareable(params.key);
      const value = String(body?.value ?? '');
      await db().systemSetting.upsert({
        where: { key: params.key },
        update: { value },
        create: { key: params.key, value },
      });
      return { key: params.key, value };
    },
  },

  {
    method: 'DELETE',
    path: '/settings/:key',
    roles: ['ADMIN', 'SUPER_ADMIN'],
    handler: async ({ params }) => {
      assertShareable(params.key);
      const deleted = await db().systemSetting.deleteMany({ where: { key: params.key } });
      if (deleted.count === 0) throw notFound('Setting not found');
      return { key: params.key, deleted: true };
    },
  },
];
