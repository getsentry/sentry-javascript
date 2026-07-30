import node from '@astrojs/node';
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
  adapter: node({
    mode: 'standalone',
  }),
});
