import * as Sentry from '@sentry/browser';

window.Sentry = Sentry;

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  integrations: [Sentry.browserTracingIntegration()],
  tracePropagationTargets: ['http://sentry-test-site.example'],
  tracesSampleRate: 1,
  autoSessionTracking: false,
});

// Propagate MFE identity from current scope to span attributes.
// withScope() forks the current scope, so tags set on the fork are
// visible when fetch/XHR instrumentation creates spans synchronously.
const client = Sentry.getClient();
client.on('spanStart', span => {
  const mfeName = Sentry.getCurrentScope().getScopeData().tags['mfe.name'];
  if (mfeName) {
    span.setAttribute('mfe.name', mfeName);
  }
});
