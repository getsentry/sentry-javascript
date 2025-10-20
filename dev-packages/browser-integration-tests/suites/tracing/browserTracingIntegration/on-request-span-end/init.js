import * as Sentry from '@sentry/browser';

window.Sentry = Sentry;

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  integrations: [
    Sentry.browserTracingIntegration({
      idleTimeout: 1000,
      onRequestSpanEnd(span, { headers }) {
        if (headers) {
          span.setAttribute('hook.called.response-type', headers.get('x-response-type'));
        }
      },
    }),
  ],
  tracesSampleRate: 1,
});
