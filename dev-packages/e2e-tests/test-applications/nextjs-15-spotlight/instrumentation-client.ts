import * as Sentry from '@sentry/nextjs';

Sentry.init({
  environment: 'qa',
  dsn: process.env.NEXT_PUBLIC_E2E_TEST_DSN,
  tunnel: `http://localhost:3031/`,
  tracesSampleRate: 1.0,
  // Note: We don't explicitly set spotlight here - it should be auto-enabled
  // from NEXT_PUBLIC_SENTRY_SPOTLIGHT env var which is injected by the SDK's
  // webpack DefinePlugin and Turbopack valueInjectionLoader
});
