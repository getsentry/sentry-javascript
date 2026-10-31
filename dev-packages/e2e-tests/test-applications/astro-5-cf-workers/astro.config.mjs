import cloudflare from '@astrojs/cloudflare';
import sentry from '@sentry/astro/integration';
// @ts-check
import { defineConfig } from 'astro/config';

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
  adapter: cloudflare(),
});
