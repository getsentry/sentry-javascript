import sentry from '@sentry/astro';
// @ts-check
import { defineConfig } from 'astro/config';

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
  security: {
    allowedDomains: [{ hostname: 'localhost' }],
  },
  adapter: node({
    mode: 'standalone',
  }),
});
