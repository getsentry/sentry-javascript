import { getPlaywrightConfig } from '@sentry-internal/test-utils';
import { fileURLToPath } from 'url';

// The static trace lifecycle variant sets this to `static`.
process.env.E2E_TEST_TRACE_LIFECYCLE ??= 'stream';

const config = getPlaywrightConfig(
  {
    startCommand: `PORT=3030 pnpm start`,
    port: 3030,
  },
  // Boot Redis before the tests run, outside the webServer startup-timeout window.
  {
    globalSetup: fileURLToPath(new URL('./global-setup.mjs', import.meta.url)),
    globalTeardown: fileURLToPath(new URL('./global-teardown.mjs', import.meta.url)),
  },
);

export default config;
