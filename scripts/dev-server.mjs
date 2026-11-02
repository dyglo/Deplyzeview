import { realpath } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export const devPort = 5173;
export const devHost = '127.0.0.1';
export const identityPath = '/__deplyzeview_dev_server';
export const projectRoot = await realpath(fileURLToPath(new URL('../', import.meta.url)));

export async function probeDeplyzeviewServer() {
  try {
    const response = await fetch(`http://${devHost}:${devPort}${identityPath}`, { signal: AbortSignal.timeout(1500) });
    if (!response.ok) return false;
    const identity = await response.json();
    return identity.app === 'deplyzeview' && path.resolve(identity.root) === projectRoot;
  } catch { return false; }
}

// A server is shared only when it identifies this exact checkout. Never terminate
// an unknown port owner or silently choose a URL different from Tauri's devUrl.
export async function startDevServer({ createServer, probe = probeDeplyzeviewServer } = {}) {
  if (await probe()) return { reused: true, close: async () => {} };
  const factory = createServer ?? (await import('vite')).createServer;
  const server = await factory({ root: projectRoot, server: { host: devHost, port: devPort, strictPort: true } });
  try {
    await server.listen();
    return { reused: false, close: () => server.close() };
  } catch (error) {
    await server.close();
    // Another DeplyzeView invocation can win the bind between our probe and listen.
    if (await probe()) return { reused: true, close: async () => {} };
    if (error instanceof Error && /(?:EADDRINUSE|Port 5173 is already in use)/.test(error.message)) {
      throw new Error('Port 5173 is occupied by another server. Stop that server, then run npm run tauri dev again.', { cause: error });
    }
    throw error;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const { prepareDevelopmentAccess } = await import('./gateway-provision.mjs');
    await prepareDevelopmentAccess();
    const server = await startDevServer();
    console.log(`[deplyzeview] ${server.reused ? 'Reusing' : 'Started'} DeplyzeView dev server at http://${devHost}:${devPort}`);
    // Keep the Tauri hook alive even when it attaches to an existing server.
    const keepAlive = setInterval(() => {}, 60_000);
    let closing = false;
    const shutdown = async () => {
      if (closing) return;
      closing = true;
      clearInterval(keepAlive);
      await server.close();
      process.exit(0);
    };
    process.once('SIGINT', shutdown);
    process.once('SIGTERM', shutdown);
  } catch (error) {
    console.error(`[deplyzeview] ${error instanceof Error ? error.message : error}`);
    process.exitCode = 1;
  }
}
