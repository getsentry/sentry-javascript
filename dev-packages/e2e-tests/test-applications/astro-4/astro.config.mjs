import node from '@astrojs/node';
import sentry from '@sentry/astro';
import { defineConfig } from 'astro/config';

import spotlightjs from '@spotlightjs/astro';

// https://astro.build/config
export default defineConfig({
  output: 'hybrid',
  integrations: [
    sentry({
      debug: true,
      sourceMapsUploadOptions: {
        enabled: false,
      },
    }),
    spotlightjs(),
  ],
  adapter: node({
    mode: 'standalone',
  }),
  vite: {
    build: {
      rollupOptions: {
        external: ['https'],
      },
    },
  },
});
