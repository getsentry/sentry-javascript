const { loggingTransport } = require('@sentry-internal/node-core-integration-tests');
const Sentry = require('@sentry/node-core');
const { setupOtel } = require('../../../utils/setupOtel.js');

const client = Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  transport: loggingTransport,
  tracesSampleRate: 1.0,
});

setupOtel(client);

const express = require('express');
const { startExpressServerAndSendPortToRunner } = require('@sentry-internal/node-core-integration-tests');

const app = express();

app.get('/test', (_req, res) => {
  Sentry.captureException(new Error('test error'));
  res.json({ success: true });
});

startExpressServerAndSendPortToRunner(app);
