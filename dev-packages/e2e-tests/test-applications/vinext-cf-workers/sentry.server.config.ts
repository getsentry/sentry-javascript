import * as Sentry from '@sentry/nextjs';

// The server config of a Next.js app. vinext runs it in the Worker too, where this `init` creates no client, because
// `withSentry` from `@sentry/nextjs/cloudflare` (added by the Vite plugin) already handles the request. The tests
// check that no event carries this environment.
Sentry.init({
  dsn: process.env.E2E_TEST_DSN,
  environment: 'init-must-not-run',
  tracesSampleRate: 1.0,
});
