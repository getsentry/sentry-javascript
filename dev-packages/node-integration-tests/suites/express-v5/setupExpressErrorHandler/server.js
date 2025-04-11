const { loggingTransport } = require('@sentry-internal/node-integration-tests');
const Sentry = require('@sentry/node');

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  release: '1.0',
  transport: loggingTransport,
});

// express must be required after Sentry is initialized
const express = require('express');
const cors = require('cors');
const { startExpressServerAndSendPortToRunner } = require('@sentry-internal/node-integration-tests');

const app = express();

app.use(cors());

app.get('/test1', (_req, _res) => {
  throw new Error('error_1');
});

app.get('/test2', (_req, _res) => {
  throw new Error('error_2');
});

Sentry.setupExpressErrorHandler(app, {
  shouldHandleError: error => {
    return error.message === 'error_2';
  },
});

startExpressServerAndSendPortToRunner(app);
