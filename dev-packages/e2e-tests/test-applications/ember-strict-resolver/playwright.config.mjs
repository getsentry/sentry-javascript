import { getPlaywrightConfig } from '@sentry-internal/test-utils';

const config = getPlaywrightConfig({
  startCommand: 'pnpm start',
  eventProxyFile: 'start-event-proxy.mjs',
  eventProxyPort: 3031,
  port: 3030,
});

export default config;
