import { getPlaywrightConfig } from '@sentry-internal/test-utils';

// `vite build` (where the Sentry plugin's orchestrion transform runs) produces
// the worker; `pnpm preview` (`wrangler dev`, following the vite plugin's
// `.wrangler/deploy` redirect to the built output) serves it. `globalSetup`
// spins up the MySQL container the worker connects to.
const config = getPlaywrightConfig(
  {
    startCommand: 'pnpm preview',
    port: 8787,
  },
  {
    workers: '100%',
    retries: 0,
  },
);

export default {
  ...config,
  globalSetup: './global-setup.mjs',
  globalTeardown: './global-teardown.mjs',
};
