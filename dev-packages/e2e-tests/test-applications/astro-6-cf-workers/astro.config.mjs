import sentry from '@sentry/astro/integration';
// @ts-check
import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';
import { sentryCloudflareVitePlugin } from '@sentry/cloudflare/vite';

// The tunnel variant serves the app under a base path with trailing slashes to cover that the managed tunnel
// follows both on Workers too.
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
  adapter: cloudflare(),
  vite: {
    plugins: [sentryCloudflareVitePlugin()],
  },
});
