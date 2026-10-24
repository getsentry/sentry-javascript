import sentry from '@sentry/astro';
// @ts-check
import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';
import { sentryCloudflareVitePlugin } from '@sentry/cloudflare/vite';

// https://astro.build/config
export default defineConfig({
  integrations: [
    sentry({
      debug: true,
      sourceMapsUploadOptions: {
        enabled: false,
      },
    }),
  ],
  output: 'server',
  security: {
    allowedDomains: [{ hostname: 'localhost' }],
  },
  adapter: cloudflare(),
  vite: {
    plugins: [
      // On v10, auto-instrumentation is opt-in.
      sentryCloudflareVitePlugin({
        _experimental: {
          autoInstrumentation: true,
        },
      }),
    ],
  },
});
