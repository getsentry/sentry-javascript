// Calls `experimentalUseDiagnosticsChannelInjection()`, so the orchestrion
// subtree MUST be reachable and end up in the bundle.
import * as Sentry from '@sentry/node';

Sentry.experimentalUseDiagnosticsChannelInjection();

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  tracesSampleRate: 1,
});

await import('./app.mjs');
