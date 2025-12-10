// Set the spotlight value on window BEFORE importing Sentry
// Next.js replaces process.env.NEXT_PUBLIC_* at build time, so this works
// The SDK will read window._sentrySpotlight during init()
if (typeof window !== 'undefined') {
  // @ts-expect-error - setting window property for SDK to read
  window._sentrySpotlight = process.env.NEXT_PUBLIC_SENTRY_SPOTLIGHT;
}

import * as Sentry from '@sentry/nextjs';

Sentry.init({
  environment: 'qa',
  dsn: process.env.NEXT_PUBLIC_E2E_TEST_DSN,
  tunnel: `http://localhost:3031/`,
  tracesSampleRate: 1.0,
  // Note: We don't explicitly set spotlight here - it should be auto-enabled
  // from window._sentrySpotlight which is set above
});
