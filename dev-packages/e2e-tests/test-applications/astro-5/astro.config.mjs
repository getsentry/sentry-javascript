// @ts-check
import { defineConfig } from 'astro/config';
import sentry from '@sentry/astro';

import node from '@astrojs/node';

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
