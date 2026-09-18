import { getPlaywrightConfig } from '@sentry-internal/test-utils';

// `vite build` (where the Sentry SvelteKit plugin's orchestrion transform runs) produces the
// worker; `pnpm preview` (`wrangler pages dev`) serves the built output. `globalSetup` spins up
// the MySQL container the worker connects to.
const config = getPlaywrightConfig(
  {
    startCommand: 'pnpm preview',
    port: 4173,
  },
  {
    globalSetup: './global-setup.mjs',
    globalTeardown: './global-teardown.mjs',
  },
);

export default config;
