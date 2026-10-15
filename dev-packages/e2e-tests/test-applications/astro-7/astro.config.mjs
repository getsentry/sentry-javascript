import sentry from '@sentry/astro';
// @ts-check
import { defineConfig } from 'astro/config';

import node from '@astrojs/node';

// The tunnel variant serves the app under a base path with trailing slashes to cover that the managed tunnel
// follows both.
const tunnelVariant = !!process.env.PUBLIC_E2E_TEST_TUNNEL;

// https://astro.build/config
export default defineConfig({
  ...(tunnelVariant && { base: '/docs', trailingSlash: 'always' }),
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
  adapter: node({
    mode: 'standalone',
  }),
});
