const { loggingTransport, startExpressServerAndSendPortToRunner } = require('@sentry-internal/node-integration-tests');
const Sentry = require('@sentry/node');

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  transport: loggingTransport,
  beforeSend(event) {
    if (!event.contexts.traceData) {
      event.contexts = {
        ...event.contexts,
        traceData: {
          ...Sentry.getTraceData(),
          metaTags: Sentry.getTraceMetaTags(),
        },
      };
    }
    return event;
  },
});

// express must be required after Sentry is initialized
const express = require('express');

const app = express();

app.get('/test', (_req, res) => {
  Sentry.captureException(new Error('test error'));
  res.status(200).send();
});

app.get('/test-scope', (_req, res) => {
  Sentry.withScope(scope => {
    scope.setContext('traceData', {
      ...Sentry.getTraceData(),
      metaTags: Sentry.getTraceMetaTags(),
    });
    Sentry.captureException(new Error('test error 2'));
  });
  res.status(200).send();
});

Sentry.setupExpressErrorHandler(app);

startExpressServerAndSendPortToRunner(app);
