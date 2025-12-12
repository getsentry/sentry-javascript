import { getPlaywrightConfig } from '@sentry-internal/test-utils';

const config = getPlaywrightConfig({
  // Use next dev to test development-mode behavior where Spotlight is auto-enabled.
  // Note: In Next.js 15, Turbopack is the default dev bundler and doesn't replace
  // process.env vars in node_modules code. This prevents the SDK's auto-detection
  // from working, so the test explicitly passes the spotlight value.
  startCommand: 'pnpm dev',
  port: 3030,
  eventProxyFile: 'start-event-proxy.mjs',
  eventProxyPort: 3031,
  // Increase timeout for dev server startup (slower than production)
  timeout: 90_000,
});

export default config;
