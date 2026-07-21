import { getPlaywrightConfig } from '@sentry-internal/test-utils';
import { fileURLToPath } from 'url';

const config = getPlaywrightConfig(
  {
    startCommand: `PORT=3030 pnpm start`,
    port: 3030,
  },
  // Boot Redis before the tests run, outside the webServer startup-timeout window.
  { globalSetup: fileURLToPath(new URL('./global-setup.mjs', import.meta.url)) },
);

export default config;
