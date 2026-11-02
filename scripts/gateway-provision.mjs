import { loadEnvFile } from 'node:process';
import { mkdir, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

export function developmentAccess(env = process.env) {
  const url = env.DEPLYZEVIEW_GATEWAY_URL?.trim();
  const appToken = env.DEPLYZEVIEW_APP_TOKEN?.trim();
  if (!url || !appToken) return undefined;
  return { url, appToken };
}

export async function prepareDevelopmentAccess() {
  try { loadEnvFile(fileURLToPath(new URL('../.env', import.meta.url))); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  const config = developmentAccess();
  if (!config) return;
  const directory = new URL('../src-tauri/target/', import.meta.url);
  await mkdir(directory, { recursive: true });
  await writeFile(new URL('development-gateway.json', directory), JSON.stringify(config), { mode:0o600 });
}

export async function provisionDesktop(binary) {
  const config = developmentAccess();
  if (!config) throw new Error('Set DEPLYZEVIEW_GATEWAY_URL and DEPLYZEVIEW_APP_TOKEN in the local .env before configuring this PC.');
  await new Promise((resolve, reject) => {
    const child = spawn(binary, ['--configure-gateway'], { stdio:['pipe','pipe','pipe'], windowsHide:true });
    const timer = setTimeout(() => { child.kill(); reject(new Error('Native authorization helper timed out. Use the rebuilt DeplyzeView 0.1.1 executable.')); }, 30_000);
    let output = '';
    child.stdout.on('data', chunk => { output += chunk; });
    child.stderr.resume();
    child.on('error', () => { clearTimeout(timer); reject(new Error('Could not start the native authorization helper. Build DeplyzeView 0.1.1 first.')); });
    child.on('exit', code => {
      clearTimeout(timer);
      if (code !== 0) return reject(new Error('Native application authorization failed; check gateway-status.json in the app configuration directory.'));
      try {
        const status = JSON.parse(output);
        if (!status.configured) throw new Error();
        console.log(`Application access saved by DeplyzeView at ${status.configPath}. No provider keys copied.`);
        resolve();
      } catch { reject(new Error('Native authorization helper returned no confirmation.')); }
    });
    child.stdin.on('error', () => { /* Native exit is handled above without logging input. */ });
    // Secrets travel through stdin only, never process arguments or console output.
    child.stdin.end(JSON.stringify(config));
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await prepareDevelopmentAccess();
  await provisionDesktop(process.argv[2] || fileURLToPath(new URL('../src-tauri/target/release/deplyzeview.exe', import.meta.url)));
}
