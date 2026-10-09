const { loggingTransport } = require('@sentry-internal/node-integration-tests');
const Sentry = require('@sentry/node');

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  release: '1.0',
  transport: loggingTransport,
  beforeSend(event) {
    event.contexts = {
      ...event.contexts,
      traceData: {
        ...Sentry.getTraceData(),
        metaTags: Sentry.getTraceMetaTags(),
      },
    };
    return event;
  },
});

Sentry.captureException(new Error('test error'));
