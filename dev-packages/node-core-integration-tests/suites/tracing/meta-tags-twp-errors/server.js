const {
  loggingTransport,
  startExpressServerAndSendPortToRunner,
} = require('@sentry-internal/node-core-integration-tests');
const Sentry = require('@sentry/node-core');
const { setupOtel } = require('../../../utils/setupOtel.js');

const client = Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  transport: loggingTransport,
});

setupOtel(client);

// express must be required after Sentry is initialized
const express = require('express');

const app = express();

app.get('/test', (_req, res) => {
  Sentry.withScope(scope => {
    scope.setContext('traceData', {
      ...Sentry.getTraceData(),
      metaTags: Sentry.getTraceMetaTags(),
    });
    Sentry.captureException(new Error('test error 2'));
  });
  res.status(200).send();
});

startExpressServerAndSendPortToRunner(app);
