import * as Sentry from '@sentry/browser';

window.Sentry = Sentry;

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  integrations: [
    Sentry.browserTracingIntegration({
      idleTimeout: 1000,
      onRequestSpanStart(span, { headers }) {
        if (headers) {
          span.setAttribute('hook.called.headers', headers.get('foo'));
        }
      },
    }),
  ],
  tracesSampleRate: 1,
});
