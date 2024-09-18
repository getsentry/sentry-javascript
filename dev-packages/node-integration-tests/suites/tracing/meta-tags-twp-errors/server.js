const { loggingTransport, startExpressServerAndSendPortToRunner } = require('@sentry-internal/node-integration-tests');
const Sentry = require('@sentry/node');

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
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

// express must be required after Sentry is initialized
const express = require('express');

const app = express();

app.get('/test', () => {
  throw new Error('test error');
});

Sentry.setupExpressErrorHandler(app);

startExpressServerAndSendPortToRunner(app);
