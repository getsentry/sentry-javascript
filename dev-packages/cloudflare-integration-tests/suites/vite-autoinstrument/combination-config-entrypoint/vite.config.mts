import { cloudflare } from '@cloudflare/vite-plugin';
import { sentryCloudflareVitePlugin } from '@sentry/cloudflare/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  // The Sentry plugin runs first so its build-time transform wraps the default
  // handler and the config-identified `AdminEntrypoint` before the Cloudflare
  // plugin bundles the worker.
  plugins: [
    cloudflare(),
    sentryCloudflareVitePlugin({
      _experimental: {
        autoInstrumentation: true,
      },
    }),
  ],
});
