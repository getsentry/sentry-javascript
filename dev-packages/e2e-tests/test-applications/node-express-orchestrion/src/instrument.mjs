import * as Sentry from '@sentry/node';

// Opting in via `experimentalUseDiagnosticsChannelInjection()` (before `init`)
// is all that's needed. Because this file runs via `node --import` before
// `app.mjs` imports `mysql`, `Sentry.init()` synchronously installs the
// channel-injection hooks.
Sentry.experimentalUseDiagnosticsChannelInjection();

Sentry.init({
  environment: 'qa', // dynamic sampling bias to keep transactions
  dsn: process.env.E2E_TEST_DSN,
  debug: !!process.env.DEBUG,
  tunnel: `http://localhost:3031/`, // proxy server
  tracesSampleRate: 1,
});
