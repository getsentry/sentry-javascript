import { getPlaywrightConfig } from '@sentry-internal/test-utils';
import { fileURLToPath } from 'url';

const injectOrchestrion = process.env.INJECT_ORCHESTRION === 'true';

const config = getPlaywrightConfig(
  {
    startCommand: `pnpm start`,
  },
  // The orchestrion variant exercises real MySQL/Redis. Boot them before the tests run,
  // outside the webServer startup-timeout window. In the default variant no DB is needed.
  injectOrchestrion
    ? {
        globalSetup: fileURLToPath(new URL('./global-setup.mjs', import.meta.url)),
        globalTeardown: fileURLToPath(new URL('./global-teardown.mjs', import.meta.url)),
      }
    : {},
);

export default config;
