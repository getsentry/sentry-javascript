// Channel-based (orchestrion diagnostics-channel) instrumentation is the default, so `Sentry.init()`
// pulls the orchestrion subtree into the bundle. `assert.mjs` verifies the marker is present.
import * as Sentry from '@sentry/node';

Sentry.init({
  traceLifecycle: 'static',
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  tracesSampleRate: 1,
});

await import('./app.mjs');
