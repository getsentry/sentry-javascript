import { getPlaywrightConfig } from '@sentry-internal/test-utils';

const config = getPlaywrightConfig({
  startCommand: 'pnpm start:import',
});

export default {
  ...config,
  globalSetup: './global-setup.mjs',
  globalTeardown: './global-teardown.mjs',
};
