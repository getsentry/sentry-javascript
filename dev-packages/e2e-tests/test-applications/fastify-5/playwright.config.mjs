import { getPlaywrightConfig, getRuntime } from '@sentry-internal/test-utils';

const startCommands = {
  node: 'pnpm start',
  bun: 'pnpm start:bun',
  deno: 'pnpm start:deno',
};

const config = getPlaywrightConfig({
  startCommand: startCommands[getRuntime()],
});

export default config;
