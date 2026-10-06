import { getPlaywrightConfig } from '@sentry-internal/test-utils';
import { fileURLToPath } from 'url';

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
  // The DB tests exercise real MySQL/Redis. Boot them before the tests run, outside the
  // webServer startup-timeout window.
  {
    globalSetup: fileURLToPath(new URL('./global-setup.mjs', import.meta.url)),
    globalTeardown: fileURLToPath(new URL('./global-teardown.mjs', import.meta.url)),
  },
);

export default config;
