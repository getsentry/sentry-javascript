const { loggingTransport } = require('@sentry-internal/node-integration-tests');
const Sentry = require('@sentry/node');

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  transport: loggingTransport,
});

// express must be required after Sentry is initialized
const express = require('express');
const { startExpressServerAndSendPortToRunner } = require('@sentry-internal/node-integration-tests');

const app = express();

app.get('/test', (_req, res) => {
  Sentry.captureException(new Error('This is a test error'));
  Sentry.getClient().on('beforeEnvelope', envelope => {
    const event = envelope[1][0][1];
    if (event.exception.values[0].value === 'This is a test error') {
      const { trace_id, span_id } = event.contexts.trace;
      res.send({
        traceData: Sentry.getTraceData(),
        traceMetaTags: Sentry.getTraceMetaTags(),
        errorTraceContext: {
          trace_id,
          span_id,
        },
      });
    }
  });
});

Sentry.setupExpressErrorHandler(app);

startExpressServerAndSendPortToRunner(app);
