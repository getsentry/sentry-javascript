import { getPlaywrightConfig } from '@sentry-internal/test-utils';

// The static trace lifecycle runs as a `sentryTest` variant of this same app,
// so the specs that assert envelope shape are split by directory. Specs directly
// under `tests/` don't depend on the lifecycle and only run in the default variant.
const isStatic = !!process.env.E2E_TEST_STATIC;

const config = getPlaywrightConfig(
  {
    startCommand: `pnpm start`,
    port: 3030,
  },
  {
    ...(isStatic ? { testMatch: '**/static/**/*.test.ts' } : { testIgnore: '**/static/**' }),
    globalSetup: './global-setup.mjs',
    globalTeardown: './global-teardown.mjs',
  },
);

export default config;
