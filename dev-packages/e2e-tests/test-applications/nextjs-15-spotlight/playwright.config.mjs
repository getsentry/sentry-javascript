import { getPlaywrightConfig } from '@sentry-internal/test-utils';

const config = getPlaywrightConfig({
  // Use next dev to test development-mode behavior where Spotlight is auto-enabled
  startCommand: 'pnpm dev',
  port: 3030,
  eventProxyFile: 'start-event-proxy.mjs',
  eventProxyPort: 3031,
  // Increase timeout for dev server startup (slower than production)
  timeout: 90_000,
});

export default config;

