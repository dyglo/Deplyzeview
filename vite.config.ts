import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

export default defineConfig({ plugins: [svelte()], clearScreen: false, server: { strictPort: true }, envPrefix: ['VITE_', 'TAURI_'], build: { target: process.env.TAURI_ENV_PLATFORM === 'windows' ? 'chrome105' : 'safari13' } });
