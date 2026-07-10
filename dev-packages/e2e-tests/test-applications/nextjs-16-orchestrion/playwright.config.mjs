import { getPlaywrightConfig } from '@sentry-internal/test-utils';

const config = getPlaywrightConfig({
  startCommand: 'pnpm next start -p 3030',
  port: 3030,
});

export default {
  ...config,
  globalSetup: './global-setup.mjs',
  globalTeardown: './global-teardown.mjs',
};
