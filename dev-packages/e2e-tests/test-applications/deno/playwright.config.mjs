import { getPlaywrightConfig } from '@sentry-internal/test-utils';

// The static trace lifecycle runs as a `sentryTest` variant of this same app,
// so the specs that assert envelope shape are split by directory and only one
// set runs per mode. Everything directly under `tests/` runs in both.
const isStatic = !!process.env.E2E_TEST_STATIC;

const config = getPlaywrightConfig(
  {
    startCommand: `pnpm start`,
    port: 3030,
  },
  {
    testIgnore: isStatic ? '**/streamed/**' : '**/static/**',
    globalSetup: './global-setup.mjs',
    globalTeardown: './global-teardown.mjs',
  },
);

export default config;
