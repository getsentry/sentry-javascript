import { getPlaywrightConfig } from '@sentry-internal/test-utils';

const config = getPlaywrightConfig(undefined, {
  // The tests read what arrived in Sentry through the sentry CLI, so there is no event proxy to start.
  webServer: undefined,
  // The worker is deployed once for the whole run and deleted again afterwards.
  globalSetup: './global-setup.ts',
  globalTeardown: './global-teardown.ts',
  // A test polls Workers Logs and then Sentry, each for up to 180s.
  timeout: 400_000,
});

export default config;
