import { cloudflare } from '@cloudflare/vite-plugin';
import { sentryCloudflareVitePlugin } from '@sentry/cloudflare/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  // Auto-instrumentation is off so this suite exercises the orchestrion
  // transform alone — the worker entry stays untouched.
  plugins: [cloudflare(), sentryCloudflareVitePlugin({ autoInstrumentation: false })],
});
