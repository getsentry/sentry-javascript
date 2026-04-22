import { getPlaywrightConfig } from '@sentry-internal/test-utils';

type Runtime = 'cloudflare' | 'node' | 'bun';

const RUNTIME = (process.env.RUNTIME || 'cloudflare') as Runtime;

const testEnv = process.env.TEST_ENV;

if (!testEnv) {
  throw new Error('No test env defined');
}

const APP_PORT = 38787;

const startCommands: Record<Runtime, string> = {
  cloudflare: `pnpm dev:cf --port ${APP_PORT}`,
  node: `pnpm dev:node`,
  bun: `pnpm dev:bun`,
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
