import sentry from '@sentry/astro';
// @ts-check
import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';

// https://astro.build/config
export default defineConfig({
  integrations: [
    sentry({
      debug: true,
      sourcemaps: {
        disable: true,
      },
    }),
  ],
  output: 'server',
  security: {
    allowedDomains: [{ hostname: 'localhost' }],
  },
  adapter: cloudflare(),
});
