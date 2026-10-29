import { getPlaywrightConfig, getRuntime } from '@sentry-internal/test-utils';
import { fileURLToPath } from 'url';

const startCommands = {
  node: 'PORT=3030 pnpm start',
  bun: 'PORT=3030 pnpm start:bun',
  deno: 'PORT=3030 pnpm start:deno',
  cloudflare: 'pnpm start:cloudflare',
};

const config = getPlaywrightConfig(
  {
    startCommand: process.env.TEST_ENV === 'development' ? 'pnpm dev --port 3030' : startCommands[getRuntime()],
    port: 3030,
  },
  // Boot Redis before the tests run, outside the webServer startup-timeout window.
  { globalSetup: fileURLToPath(new URL('./global-setup.mjs', import.meta.url)) },
);

export default config;
