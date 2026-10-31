import { getPlaywrightConfig } from '@sentry-internal/test-utils';
import { RUNTIME, type Runtime } from './tests/constants';

const testEnv = process.env.TEST_ENV;

if (!testEnv) {
  throw new Error('No test env defined');
}

const APP_PORT = 8787;

const startCommands: Record<Runtime, string> = {
  // `vite dev` pre-bundles `hono` with its Rolldown dependency optimizer, so this also tests the transform there.
  cloudflare:
    testEnv === 'development'
      ? `pnpm dev:cloudflare:vite --port ${APP_PORT} --strictPort`
      : `pnpm dev:cloudflare --port ${APP_PORT}`,
  node: `pnpm dev:node`,
  bun: `pnpm dev:bun`,
  deno: `pnpm dev:deno`,
};

const config = getPlaywrightConfig(
  {
    startCommand: startCommands[RUNTIME],
    port: APP_PORT,
  },
  {
    workers: '100%',
    retries: 0,
  },
);

export default config;
