/**
 * `pullStoreConfig`: GET /store-config applied to this till.
 *
 * What it must get right is the super-admin password. An OFFLINE_ONLY till never syncs, so this
 * is its only way to hear of a password set after its setup, and pairing a satellite refused with
 * "set it on the dashboard" however many times it was set there.
 */

jest.mock('electron', () => ({ BrowserWindow: { getAllWindows: () => [] } }));
jest.mock('../config/app-config', () => ({
  getAppConfig: () => ({ vpsApiUrl: 'https://vps.example/api', terminalId: 'T2' }),
}));

let inMemoryToken: string | null = null;
jest.mock('./queue-manager', () => ({ getServerToken: () => inMemoryToken }));

let satellite = false;
jest.mock('../lan/role', () => ({ isSatellite: async () => satellite }));
jest.mock('../local-server', () => ({ syncLocalServerWithMode: jest.fn(async () => undefined) }));
jest.mock('../license/license', () => ({
  acceptLicense: jest.fn(async () => true),
  terminalClaimQuery: async () => '?terminal_id=T2',
}));

let persistedToken: string | null = null;
const prismaMock = {
  systemSetting: {
    findUnique: jest.fn(async ({ where }: { where: { key: string } }) =>
      where.key === 'server_token' && persistedToken ? { value: persistedToken } : null,
    ),
    upsert: jest.fn(async () => undefined),
  },
  localConfig: { update: jest.fn(async (_args: { data: Record<string, unknown> }) => undefined) },
};
jest.mock('../database/sqlite-client', () => ({ getPrismaClient: () => prismaMock }));

import { pullStoreConfig } from './store-config';
import { acceptLicense } from '../license/license';

function serverSends(body: Record<string, unknown>, ok = true) {
  global.fetch = jest.fn(async () => ({ ok, status: ok ? 200 : 401, json: async () => body })) as never;
}
const written = () => prismaMock.localConfig.update.mock.calls.map(([args]) => args.data);

beforeEach(() => {
  jest.clearAllMocks();
  inMemoryToken = null;
  persistedToken = 'setup-token';
  satellite = false;
  serverSends({ mode: 'OFFLINE_ONLY', super_admin_password_hash: '$2a$10$hash', license: 'lic' });
});

it('takes the super-admin password hash with the token kept from setup', async () => {
  expect(await pullStoreConfig(jest.fn())).toBe(true);

  const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
  expect(url).toBe('https://vps.example/api/store-config?terminal_id=T2');
  expect(init.headers.Authorization).toBe('Bearer setup-token');
  expect(written()).toEqual([{ mode: 'OFFLINE_ONLY', superAdminPassword: '$2a$10$hash' }]);
  expect(acceptLicense).toHaveBeenCalledWith('lic');
});

it('prefers the token a sign-in armed this session', async () => {
  inMemoryToken = 'fresh-token';
  await pullStoreConfig(jest.fn());
  expect((global.fetch as jest.Mock).mock.calls[0][1].headers.Authorization).toBe('Bearer fresh-token');
});

// The super admin removing it must reach the till too.
it('clears the password when the server says there is none', async () => {
  serverSends({ super_admin_password_hash: null });
  await pullStoreConfig(jest.fn());
  expect(written()).toEqual([{ superAdminPassword: null }]);
});

it('leaves the password alone when an older server does not send the field', async () => {
  serverSends({ mode: 'ONLINE' });
  await pullStoreConfig(jest.fn());
  expect(written()).toEqual([{ mode: 'ONLINE' }]);
});

it('asks nothing without a credential', async () => {
  persistedToken = null;
  expect(await pullStoreConfig(jest.fn())).toBe(false);
  expect(global.fetch).not.toHaveBeenCalled();
});

// A satellite's server is its main, never the VPS.
it('never reaches the VPS from a satellite', async () => {
  satellite = true;
  expect(await pullStoreConfig(jest.fn())).toBe(false);
  expect(global.fetch).not.toHaveBeenCalled();
});

it('writes nothing when the server refuses the token, and says so', async () => {
  serverSends({}, false);
  expect(await pullStoreConfig(jest.fn())).toBe(false);
  expect(prismaMock.localConfig.update).not.toHaveBeenCalled();
});

it('tells the renderer the mode, never the hash', async () => {
  const notify = jest.fn();
  await pullStoreConfig(notify);
  expect(notify).toHaveBeenCalledWith('config:modeChanged', { mode: 'OFFLINE_ONLY' });
});
