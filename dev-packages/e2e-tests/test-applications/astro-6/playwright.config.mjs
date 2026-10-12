import { getPlaywrightConfig, getRuntime } from '@sentry-internal/test-utils';

const testEnv = process.env.TEST_ENV;

if (!testEnv) {
  throw new Error('No test env defined');
}

const startCommands = {
  node: 'pnpm start',
  bun: 'pnpm start:bun',
  deno: 'pnpm start:deno',
  cloudflare: 'pnpm start:cloudflare',
};

const config = getPlaywrightConfig(
  {
    startCommand: startCommands[getRuntime()],
  },
  {
    globalSetup: './global-setup.mjs',
    globalTeardown: './global-teardown.mjs',
  },
);

export default config;
