import { spawn } from 'node:child_process';
import { loadEnvFile } from 'node:process';
import { once } from 'node:events';
try { loadEnvFile('.env'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
const mode = process.argv[2] || 'dev';
if (!['dev','build'].includes(mode)) throw new Error('Expected dev or build');
const env = { ...process.env };
let localGateway;
if (env.DEPLYZEVIEW_GATEWAY_URL) {
  const url = new URL(env.DEPLYZEVIEW_GATEWAY_URL);
  const loopback = ['127.0.0.1','localhost','[::1]'].includes(url.hostname);
  if ((url.protocol !== 'https:' && !(loopback && url.protocol === 'http:')) || url.username || url.password || url.search || url.hash) throw new Error('Gateway URL must use HTTPS (or loopback HTTP) and contain no credentials, query or fragment.');
  if (mode === 'build' && loopback) console.warn('Building with a loopback gateway URL: other PCs require a provisioned production URL.');
  if (mode === 'dev' && loopback && env.DEPLYZEVIEW_APP_TOKEN) {
    let running = false;
    try {
      const response = await fetch(`${url.origin}/v1/health`, { headers:{Authorization:`Bearer ${env.DEPLYZEVIEW_APP_TOKEN}`}, signal:AbortSignal.timeout(1500) });
      if (!response.ok || !Array.isArray((await response.json()).providers)) throw new Error('The local gateway port is occupied by a service that cannot authenticate this app.');
      running = true;
    } catch (error) {
      if (error.cause?.code !== 'ECONNREFUSED') throw new Error('Cannot reuse the local market-data gateway. Check its port and application token.', { cause:error });
    }
    if (!running) {
      const { configuration } = await import('../gateway/config.mjs');
      const { createGateway } = await import('../gateway/server.mjs');
      const config = configuration();
      if (Number(url.port || 80) !== config.port) throw new Error('DEPLYZEVIEW_GATEWAY_URL and MARKET_DATA_PORT must use the same local port.');
      localGateway = createGateway(config);
      localGateway.listen(config.port, config.host);
      await once(localGateway, 'listening');
      console.log('Started local market-data gateway for this desktop session.');
    }
  }
}
// Only the gateway server loads provider credentials. Desktop builds never need them.
for (const key of Object.keys(env)) {
  if (/^(OANDA_|NARWHAL_|FINZDATA_|MARKET_DATA_)/.test(key) || (mode === 'build' && key === 'DEPLYZEVIEW_APP_TOKEN')) delete env[key];
}
const child = spawn(process.execPath, ['node_modules/@tauri-apps/cli/tauri.js', mode], { stdio:'inherit', env });
child.on('exit', code => { localGateway?.shutdown(); process.exitCode = code ?? 1; });
child.on('error', () => { localGateway?.shutdown(); process.exitCode = 1; });
for (const signal of ['SIGINT','SIGTERM']) process.once(signal, () => { localGateway?.shutdown(); child.kill(); });
