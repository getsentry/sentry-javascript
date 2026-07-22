import * as Sentry from '@sentry/node';

// Channel-based (orchestrion diagnostics-channel) instrumentation is the default. Because this file
// runs via `node --import` before `app.mjs` imports `mysql`, `Sentry.init()` synchronously installs
// the channel-injection hooks.
Sentry.init({
  traceLifecycle: 'static',
  environment: 'qa', // dynamic sampling bias to keep transactions
  dsn: process.env.E2E_TEST_DSN,
  debug: !!process.env.DEBUG,
  tunnel: `http://localhost:3031/`, // proxy server
  tracesSampleRate: 1,
});
