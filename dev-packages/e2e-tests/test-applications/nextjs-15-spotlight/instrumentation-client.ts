import * as Sentry from '@sentry/nextjs';

// Debug: Log what the valueInjectionLoader injected (if anything)
// The loader should inject globalThis["NEXT_PUBLIC_SENTRY_SPOTLIGHT"] = "true" before this code
console.log('[Sentry Debug] globalThis.NEXT_PUBLIC_SENTRY_SPOTLIGHT:', (globalThis as Record<string, unknown>)['NEXT_PUBLIC_SENTRY_SPOTLIGHT']);
console.log('[Sentry Debug] process.env.NEXT_PUBLIC_SENTRY_SPOTLIGHT:', process.env.NEXT_PUBLIC_SENTRY_SPOTLIGHT);

Sentry.init({
  environment: 'qa',
  dsn: process.env.NEXT_PUBLIC_E2E_TEST_DSN,
  tunnel: `http://localhost:3031/`,
  tracesSampleRate: 1.0,
  // Note: We don't explicitly set spotlight here - it should be auto-enabled
  // from NEXT_PUBLIC_SENTRY_SPOTLIGHT env var which is injected by the SDK's
  // valueInjectionLoader to globalThis
});
