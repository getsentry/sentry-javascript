import { cloudflare } from '@cloudflare/vite-plugin';
import { sentryCloudflareVitePlugin } from '@sentry/cloudflare/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  // The Sentry plugin runs first so its build-time transform runs over the
  // worker entry — it must skip the manually wrapped `Counter` and only wrap
  // the plain default export.
  plugins: [
    cloudflare(),
    sentryCloudflareVitePlugin({
      _experimental: {
        autoInstrumentation: true,
      },
    }),
  ],
});
