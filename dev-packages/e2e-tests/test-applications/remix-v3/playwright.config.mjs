import { getPlaywrightConfig } from '@sentry-internal/test-utils';

const config = getPlaywrightConfig({
  startCommand: `pnpm start`,
  port: 3060,
  eventProxyPort: 3061,
});

export default config;
