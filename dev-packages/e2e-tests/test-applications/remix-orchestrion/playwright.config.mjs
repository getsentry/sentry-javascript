import { getPlaywrightConfig } from '@sentry-internal/test-utils';
import { fileURLToPath } from 'url';

const config = getPlaywrightConfig(
  {
    startCommand: `pnpm start`,
  },
  // Boot MySQL and Redis before the tests run, outside the webServer startup-timeout window.
  {
    globalSetup: fileURLToPath(new URL('./global-setup.mjs', import.meta.url)),
    globalTeardown: fileURLToPath(new URL('./global-teardown.mjs', import.meta.url)),
  },
);

export default config;
