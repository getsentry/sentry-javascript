import { getPlaywrightConfig } from '@sentry-internal/test-utils';

const config = getPlaywrightConfig({
  startCommand: 'pnpm dev',
  port: 8787,
  eventProxyFile: 'start-event-proxy.mjs',
});

export default config;
