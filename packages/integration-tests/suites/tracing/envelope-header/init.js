import * as Sentry from '@sentry/browser';
import { Integrations } from '@sentry/tracing';

window.Sentry = Sentry;

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  integrations: [new Integrations.BrowserTracing({ tracingOrigins: [/.*/] })],
  environment: 'production',
  tracesSampleRate: 1,
  // TODO: We're rethinking the mechanism for including Pii data in DSC, hence commenting out sendDefaultPii for now
  // sendDefaultPii: true,
  debug: true,
});

Sentry.configureScope(scope => {
  scope.setUser({ id: 'user123', segment: 'segmentB' });
  scope.setTransactionName('testTransactionDSC');
});
