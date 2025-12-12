import * as Sentry from '@sentry/nextjs';

// In Next.js 15, Turbopack is the default dev bundler. Turbopack doesn't replace
// process.env vars in node_modules code, which prevents the SDK's auto-detection
// from working. As a workaround, we explicitly pass the spotlight value from
// process.env which Next.js DOES replace in user code.
//
// Note: Auto-detection DOES work in:
// - Next.js with webpack (older versions or configured to use webpack)
// - Other frameworks like Vite, Create React App, etc.
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
