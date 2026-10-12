import * as Sentry from '@sentry/browser';

window.Sentry = Sentry;

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  integrations: [],
  tracesSampleRate: 1,
});

Sentry.startSpan({ name: 'parent' }, () => {
  for (let i = 0; i < 5000; i++) {
    Sentry.startInactiveSpan({ name: `child ${i}` }).end();
  }
});
