import { getPlaywrightConfig, getRuntime } from '@sentry-internal/test-utils';

const testEnv = process.env.TEST_ENV;

if (!testEnv) {
  throw new Error('No test env defined');
}

const productionStartCommands = {
  node: 'pnpm start',
  bun: 'pnpm start:bun',
  deno: 'pnpm start:deno',
  cloudflare: 'pnpm start:cloudflare',
};

const getStartCommand = () => {
  if (testEnv === 'development') {
    // The Sentry server config is bundled into the dev server via a nitro plugin, so no preload is needed.
    return 'nuxt dev -p 3030';
  }

  if (testEnv === 'production') {
    return productionStartCommands[getRuntime()];
  }

  // Runs the suite with the compat shim preloaded, like existing `--import` deploy commands do.
  if (testEnv === 'production-import') {
    return 'pnpm start:import';
  }

  throw new Error(`Unknown test env: ${testEnv}`);
};

const config = getPlaywrightConfig({
  startCommand: getStartCommand(),
});

export default {
  ...config,
  globalSetup: './global-setup.mjs',
  globalTeardown: './global-teardown.mjs',
};
