import * as Sentry from '@sentry/browser';
import { Integrations } from '@sentry/tracing';

window.Sentry = Sentry;

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  integrations: [new Integrations.BrowserTracing()],
  release: '1.0.0',
  environment: 'production',
  tracesSampleRate: 1,
});

Sentry.configureScope(scope => scope.setUser({ id: 'user123', segment: 'segmentB' }));
