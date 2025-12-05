import { getPlaywrightConfig } from '@sentry-internal/test-utils';

const config = getPlaywrightConfig({
  // Use vite dev server to test development-mode behavior (e.g., Spotlight auto-enablement)
  startCommand: `pnpm dev`,
  eventProxyFile: 'start-event-proxy.mjs',
  eventProxyPort: 3031,
  port: 3030,
});

export default config;
