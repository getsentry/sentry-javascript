import { cloudflare } from '@cloudflare/vite-plugin';
import { sentryCloudflareVitePlugin } from '@sentry/cloudflare/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  // The Sentry plugin runs first so its orchestrion transform injects the
  // `orchestrion:mysql:query` diagnostics channel into the bundled `mysql`
  // package before `@cloudflare/vite-plugin` finalizes the worker bundle.
  plugins: [sentryCloudflareVitePlugin(), cloudflare()],
});
