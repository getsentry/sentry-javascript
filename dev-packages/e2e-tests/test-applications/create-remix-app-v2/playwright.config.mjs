import { getPlaywrightConfig } from '@sentry-internal/test-utils';
import { fileURLToPath } from 'url';

const injectOrchestrion = process.env.INJECT_ORCHESTRION === 'true';

// `remix vite:dev` ignores PORT, so the port goes on the command. The dev server has no
// bundle, so the SDK is loaded through `--import` the way `pnpm start` does it.
const startCommand =
  process.env.TEST_ENV === 'development'
    ? `NODE_OPTIONS='--import=./instrument.server.cjs' pnpm dev --port 3030`
    : `pnpm start`;

const config = getPlaywrightConfig(
  {
    startCommand,
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
