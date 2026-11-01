import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export default defineConfig({ plugins: [svelte(), {
  name: 'deplyzeview-dev-server-identity',
  configureServer(server) {
    server.middlewares.use('/__deplyzeview_dev_server', (_request, response) => {
      response.setHeader('Content-Type', 'application/json');
      response.setHeader('Cache-Control', 'no-store');
      response.end(JSON.stringify({ app: 'deplyzeview', root: realpathSync(fileURLToPath(new URL('.', import.meta.url))) }));
    });
  },
}], clearScreen: false, server: { host: '127.0.0.1', port: 5173, strictPort: true }, envPrefix: ['VITE_', 'TAURI_'], build: { target: process.env.TAURI_ENV_PLATFORM === 'windows' ? 'chrome105' : 'safari13' } });
