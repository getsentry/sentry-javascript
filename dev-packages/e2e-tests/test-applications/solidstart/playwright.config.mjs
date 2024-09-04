import { getPlaywrightConfig } from '@sentry-internal/test-utils';

const config = getPlaywrightConfig({
  startCommand: 'pnpm preview',
  port: 3030,
  timeout: 40_000,
});

export default config;
