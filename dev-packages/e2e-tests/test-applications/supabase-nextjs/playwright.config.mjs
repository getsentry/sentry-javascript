import { getPlaywrightConfig } from '@sentry-internal/test-utils';

const config = getPlaywrightConfig({
  startCommand: `pnpm dev`,
  port: 3030,
});

export default config;
