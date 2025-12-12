import * as Sentry from '@sentry/nextjs';

// Debug: Log what values the valueInjectionLoader should have set
// This runs AFTER imports are processed but BEFORE Sentry.init()
console.log(
  '[Sentry Debug] After imports - globalThis._sentrySpotlight:',
  (globalThis as Record<string, unknown>)['_sentrySpotlight'],
);
console.log(
  '[Sentry Debug] After imports - globalThis.NEXT_PUBLIC_SENTRY_SPOTLIGHT:',
  (globalThis as Record<string, unknown>)['NEXT_PUBLIC_SENTRY_SPOTLIGHT'],
);

Sentry.init({
  environment: 'qa',
  dsn: process.env.NEXT_PUBLIC_E2E_TEST_DSN,
  tunnel: `http://localhost:3031/`,
  tracesSampleRate: 1.0,
  // Note: We don't explicitly set spotlight here - it should be auto-enabled
  // via the valueInjectionLoader which sets globalThis._sentrySpotlight
});
