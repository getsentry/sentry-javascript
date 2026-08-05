import { getPlaywrightConfig } from '@sentry-internal/test-utils';

// `nuxt build` (where the Sentry Nuxt module's orchestrion transform runs over Nitro's Cloudflare
// preset) produces the worker; `pnpm preview` (`wrangler dev`) serves it. `globalSetup` spins up the
// MySQL container the worker connects to.
const config = getPlaywrightConfig(
  {
    startCommand: 'pnpm preview',
    port: 3030,
  },
  {
    globalSetup: './global-setup.mjs',
    globalTeardown: './global-teardown.mjs',
  },
);

export default config;
