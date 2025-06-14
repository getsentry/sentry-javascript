const { loggingTransport } = require('@sentry-internal/node-integration-tests');
const Sentry = require('@sentry/node');

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  release: '1.0',
  transport: loggingTransport,
});

// express must be required after Sentry is initialized
const express = require('express');
const { startExpressServerAndSendPortToRunner } = require('@sentry-internal/node-integration-tests');

const app = express();

app.get('/test1', () => {
  throw new Error('error_1');
});

Sentry.setupExpressErrorHandler(app);

startExpressServerAndSendPortToRunner(app);
