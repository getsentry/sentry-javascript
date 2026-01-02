import * as Sentry from '@sentry/nextjs';

// Initialize Sentry - the @sentry/nextjs SDK automatically parses
// NEXT_PUBLIC_SENTRY_SPOTLIGHT from process.env (zero-config for Next.js!)
//
// NOTE: We do NOT explicitly set `spotlight` option!
// The SDK should automatically:
// 1. Read NEXT_PUBLIC_SENTRY_SPOTLIGHT from process.env
// 2. Enable Spotlight with the URL from the env var
// 3. Add the spotlightBrowserIntegration to send events to the sidecar
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_E2E_TEST_DSN,
  tunnel: 'http://localhost:3031/',
  tracesSampleRate: 1.0,
  environment: 'qa',
});
