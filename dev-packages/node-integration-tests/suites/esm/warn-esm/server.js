const { loggingTransport } = require('@sentry-internal/node-integration-tests');
const Sentry = require('@sentry/node');

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  release: '1.0',
  transport: loggingTransport,
});

const { startExpressServerAndSendPortToRunner } = require('@sentry-internal/node-integration-tests');
const express = require('express');

const app = express();

app.get('/test/success', (req, res) => {
  res.send({ response: 'response 3' });
});

Sentry.setupExpressErrorHandler(app);

startExpressServerAndSendPortToRunner(app);
