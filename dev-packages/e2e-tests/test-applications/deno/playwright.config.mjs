import { getPlaywrightConfig } from '@sentry-internal/test-utils';

// The static trace lifecycle variant sets this to `static`.
process.env.E2E_TEST_TRACE_LIFECYCLE ??= 'stream';

const config = getPlaywrightConfig(
  {
    startCommand: `pnpm start`,
    port: 3030,
  },
  {
    globalSetup: './global-setup.mjs',
    globalTeardown: './global-teardown.mjs',
  },
);

export default config;
