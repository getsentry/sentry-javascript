import { getPlaywrightConfig } from '@sentry-internal/test-utils';

const config = getPlaywrightConfig(undefined, {
  // The tests read what arrived in Sentry through the sentry CLI, so there is no event proxy to start.
  webServer: undefined,
  // The worker is deployed once for the whole run and deleted again afterwards.
  globalSetup: './global-setup.ts',
  globalTeardown: './global-teardown.ts',
  /* Spans take ~2min to become queryable via the trace endpoint. */
  timeout: 210_000,
  // Every test spends most of its time polling Sentry, so run them all at once.
  fullyParallel: true,
  workers: '100%',
});

export default config;
