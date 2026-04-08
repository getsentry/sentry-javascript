import cloudflare from '@astrojs/cloudflare';
import sentry from '@sentry/astro';
// @ts-check
import { defineConfig } from 'astro/config';

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
  adapter: cloudflare(),
});
