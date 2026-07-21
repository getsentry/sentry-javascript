import { getPlaywrightConfig } from '@sentry-internal/test-utils';

// `vite build` (the Sentry plugin's auto-instrument transform runs there)
// produces the worker; `pnpm preview` (`wrangler dev`) serves the built output.
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

export default config;
