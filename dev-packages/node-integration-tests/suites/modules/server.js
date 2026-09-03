const { loggingTransport } = require('@sentry-internal/node-integration-tests');
const Sentry = require('@sentry/node');

Sentry.init({
  traceLifecycle: 'static',
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  release: '1.0',
  transport: loggingTransport,
  // Tracing is off, so `expressIntegration()` is not a default integration; opt in explicitly to
  // capture the thrown route error this test inspects.
  integrations: [Sentry.expressIntegration()],
});

// express must be required after Sentry is initialized
const express = require('express');
const { startExpressServerAndSendPortToRunner } = require('@sentry-internal/node-integration-tests');

const app = express();

app.get('/test1', () => {
  throw new Error('error_1');
});

startExpressServerAndSendPortToRunner(app);
