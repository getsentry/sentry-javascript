// Does NOT call `experimentalUseDiagnosticsChannelInjection()`, so a bundler
// must be able to drop the entire orchestrion subtree from the output.
import * as Sentry from '@sentry/node';

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  tracesSampleRate: 1,
});

await import('./app.mjs');
