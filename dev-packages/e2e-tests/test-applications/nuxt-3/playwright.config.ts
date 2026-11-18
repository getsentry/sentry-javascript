import { getPlaywrightConfig } from '@sentry-internal/test-utils';

const config = getPlaywrightConfig({
  // The inject modes load the server config from the server entry, so they start without a preload.
  startCommand: process.env.E2E_TEST_INJECT_MODE ? 'pnpm start' : 'pnpm start:import',
});

export default config;
