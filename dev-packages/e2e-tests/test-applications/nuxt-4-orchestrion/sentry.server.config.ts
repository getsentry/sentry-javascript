import * as Sentry from '@sentry/nuxt';

// Runtime hook that injects diagnostics-channel calls into externalized deps (e.g. `mysql`),
// which OTel can't instrument under ESM/`--import`. Must run before `Sentry.init()`.
Sentry.experimentalUseDiagnosticsChannelInjection();

Sentry.init({
  debug: true,
  dsn: 'https://NdLkDyrRj27C@teley.dev/0',
  tracesSampleRate: 1.0, // Capture 100% of the transactions
  tunnel: 'http://localhost:3031/', // proxy server
});
