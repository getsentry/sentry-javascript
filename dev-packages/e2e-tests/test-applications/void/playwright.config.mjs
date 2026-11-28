import { getPlaywrightConfig, getRuntime } from '@sentry-internal/test-utils';

const startCommands = {
  node: 'pnpm start',
  cloudflare: 'pnpm start:cloudflare',
};

export default getPlaywrightConfig({
  startCommand: startCommands[getRuntime()],
});
