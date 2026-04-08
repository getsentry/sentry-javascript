import { getPlaywrightConfig } from '@sentry-internal/test-utils';

const config = getPlaywrightConfig({
  startCommand: `PORT=3030 pnpm start`,
  port: 3030,
});

export default config;
