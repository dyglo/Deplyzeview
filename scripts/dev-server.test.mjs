import test from 'node:test';
import assert from 'node:assert/strict';
import { startDevServer } from './dev-server.mjs';

function fakeServer(error) {
  const calls = { listen: 0, close: 0 };
  return { calls, async listen() { calls.listen++; if (error) throw error; }, async close() { calls.close++; } };
}
test('reuses a verified server without starting or stopping another Vite process', async () => {
  const result = await startDevServer({ probe: async () => true, createServer: () => { throw new Error('must not create a second server'); } });
  assert.equal(result.reused, true);
  await result.close();
});
test('starts a server at the fixed Tauri URL when none is available', async () => {
  const server = fakeServer();
  const result = await startDevServer({ probe: async () => false, createServer: async options => {
    assert.deepEqual(options.server, { host: '127.0.0.1', port: 5173, strictPort: true });
    return server;
  } });
  assert.equal(result.reused, false);
  assert.equal(server.calls.listen, 1);
  await result.close();
  assert.equal(server.calls.close, 1);
});
test('a concurrent DeplyzeView startup can win the port without causing a failure', async () => {
  const server = fakeServer(new Error('Port 5173 is already in use'));
  let probes = 0;
  const result = await startDevServer({ probe: async () => ++probes > 1, createServer: async () => server });
  assert.equal(result.reused, true);
  assert.equal(server.calls.close, 1);
});
test('an unrelated port owner is never killed and produces an actionable error', async () => {
  const server = fakeServer(new Error('Port 5173 is already in use'));
  await assert.rejects(startDevServer({ probe: async () => false, createServer: async () => server }), /occupied by another server/);
  assert.equal(server.calls.close, 1);
});
test('other Vite startup failures are preserved', async () => {
  const error = new Error('invalid configuration');
  await assert.rejects(startDevServer({ probe: async () => false, createServer: async () => fakeServer(error) }), error);
});
import { probeDeplyzeviewServer, projectRoot } from './dev-server.mjs';
test('server identity rejects another app or another checkout on the same port', async (t) => {
  const identities = [{ app: 'other-app', root: projectRoot }, { app: 'deplyzeview', root: `${projectRoot}-other` }, { app: 'deplyzeview' }];
  for (const identity of identities) {
    const mocked = t.mock.method(globalThis, 'fetch', async () => ({ ok: true, json: async () => identity }));
    assert.equal(await probeDeplyzeviewServer(), false);
    mocked.mock.restore();
  }
  t.mock.method(globalThis, 'fetch', async () => ({ ok: true, json: async () => ({ app: 'deplyzeview', root: projectRoot }) }));
  assert.equal(await probeDeplyzeviewServer(), true);
});
