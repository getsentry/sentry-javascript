import { cloudflare } from '@cloudflare/vite-plugin';
import { sentryCloudflareVitePlugin } from '@sentry/cloudflare/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  // The Sentry plugin runs first so its build-time transform wraps the worker
  // entry and the `MyWorkflow` class before the Cloudflare plugin bundles it.
  plugins: [
    cloudflare(),
    sentryCloudflareVitePlugin({
      _experimental: {
        autoInstrumentation: true,
      },
    }),
  ],
});
