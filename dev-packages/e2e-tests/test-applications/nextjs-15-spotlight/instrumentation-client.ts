// Debug: manually set the global BEFORE importing Sentry
// This tests if the SDK can read globals at all
// @ts-expect-error - setting global for debugging
globalThis._sentrySpotlightManual = process.env.NEXT_PUBLIC_SENTRY_SPOTLIGHT;

import * as Sentry from '@sentry/nextjs';

Sentry.init({
  environment: 'qa',
  dsn: process.env.NEXT_PUBLIC_E2E_TEST_DSN,
  tunnel: `http://localhost:3031/`,
  tracesSampleRate: 1.0,
  debug: true,
  // Note: We don't explicitly set spotlight here - it should be auto-enabled
  // from NEXT_PUBLIC_SENTRY_SPOTLIGHT env var in development mode
});
