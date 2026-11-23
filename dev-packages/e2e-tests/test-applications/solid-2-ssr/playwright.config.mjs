import { getPlaywrightConfig, getRuntime } from '@sentry-internal/test-utils';

const startCommands = {
  node: 'pnpm start',
  cloudflare: 'pnpm start:cloudflare',
};

const config = getPlaywrightConfig({
  startCommand: startCommands[getRuntime()],
  port: 3030,
});

export default config;
