import { getPlaywrightConfig } from '@sentry-internal/test-utils';

const config = getPlaywrightConfig({
  startCommand: `pnpm start:import`,
});

export default {
  ...config,
  workers: process.env.CI ? 4 : config.workers,
};
