import { sentrySolidStart } from '@sentry/solidstart/vite';
import { solidStart } from '@solidjs/start/config';
import { nitro } from 'nitro/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  base: '/app/',
  plugins: [solidStart(), sentrySolidStart(), nitro({ serverDir: './server' })],
});
