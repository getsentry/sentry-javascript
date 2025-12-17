import * as Sentry from '@sentry/nextjs';

// In Next.js 15 Turbopack dev mode, custom loaders aren't applied to instrumentation files.
// So we need to explicitly pass the spotlight value from process.env which Next.js DOES replace.
// This is a workaround for the valueInjectionLoader not working in Turbopack.
const spotlightValue = process.env.NEXT_PUBLIC_SENTRY_SPOTLIGHT === 'true';

console.log('[Sentry Debug] Spotlight from process.env:', spotlightValue);

Sentry.init({
  environment: 'qa',
  dsn: process.env.NEXT_PUBLIC_E2E_TEST_DSN,
  tunnel: `http://localhost:3031/`,
  tracesSampleRate: 1.0,
  // Explicitly pass spotlight value since auto-detection doesn't work in Turbopack dev mode
  spotlight: spotlightValue,
});
