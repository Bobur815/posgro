import { createServer, request, Agent, type Server } from 'http';
import type { AddressInfo } from 'net';

// index.ts pulls in the app's database and Electron; closeServer itself needs neither.
jest.mock('../database/sqlite-client', () => ({}));
jest.mock('electron', () => ({ app: { getPath: () => '' } }));
jest.mock('../logger', () => ({ log: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } }));

import { closeServer } from './index';

/** A server that holds idle keep-alive sockets for a minute, like the real one. */
async function listen(
  handler: Parameters<typeof createServer>[1],
): Promise<{ server: Server; port: number }> {
  const server = createServer(handler);
  server.keepAliveTimeout = 60_000;
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  return { server, port: (server.address() as AddressInfo).port };
}

function get(
  port: number,
  agent: Agent,
): Promise<{ status: number; body: string } | { error: string }> {
  return new Promise((resolve) => {
    const req = request({ host: '127.0.0.1', port, path: '/', agent }, (res) => {
      let body = '';
      res.on('data', (c) => (body += c));
      res.on('end', () => resolve({ status: res.statusCode ?? 0, body }));
      res.on('error', (e) => resolve({ error: e.message }));
    });
    req.on('error', (e) => resolve({ error: e.message }));
    req.end();
  });
}

describe('closeServer', () => {
  it('does not wait for an idle keep-alive socket', async () => {
    const { server, port } = await listen((_req, res) => res.end('ok'));
    const agent = new Agent({ keepAlive: true, keepAliveMsecs: 60_000 });
    expect(await get(port, agent)).toEqual({ status: 200, body: 'ok' });

    const started = Date.now();
    await closeServer(server, 5_000);
    expect(Date.now() - started).toBeLessThan(1_000);
    agent.destroy();
  });

  it('lets a request already being answered finish within the grace period', async () => {
    const { server, port } = await listen((_req, res) => {
      setTimeout(() => res.end('late'), 300);
    });
    const agent = new Agent({ keepAlive: true });
    const pending = get(port, agent);
    await new Promise((r) => setTimeout(r, 50)); // the request is in, the answer is not

    await closeServer(server, 2_000);
    expect(await pending).toEqual({ status: 200, body: 'late' });
    agent.destroy();
  });

  it('cuts a request that never finishes once the grace period is over', async () => {
    const { server, port } = await listen(() => {
      /* never answers */
    });
    const agent = new Agent({ keepAlive: true });
    const pending = get(port, agent);
    await new Promise((r) => setTimeout(r, 50));

    const started = Date.now();
    await closeServer(server, 200);
    expect(Date.now() - started).toBeLessThan(2_000);
    expect(await pending).toHaveProperty('error');
    agent.destroy();
  });
});
