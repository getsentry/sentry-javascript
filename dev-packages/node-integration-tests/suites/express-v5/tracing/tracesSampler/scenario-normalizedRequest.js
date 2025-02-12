const { loggingTransport } = require('@sentry-internal/node-integration-tests');
const Sentry = require('@sentry/node');

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  release: '1.0',
  transport: loggingTransport,
  tracesSampler: samplingContext => {
    // The sampling decision is based on whether the data in `normalizedRequest` is available --> this is what we want to test for
    return (
      samplingContext.normalizedRequest.url.includes('/test-normalized-request?query=123') &&
      samplingContext.normalizedRequest.method &&
      samplingContext.normalizedRequest.query_string === 'query=123' &&
      !!samplingContext.normalizedRequest.headers
    );
  },
});

// express must be required after Sentry is initialized
const express = require('express');
const cors = require('cors');
const { startExpressServerAndSendPortToRunner } = require('@sentry-internal/node-integration-tests');

const app = express();

app.use(cors());

app.get('/test-normalized-request', (_req, res) => {
  res.send('Success');
});

Sentry.setupExpressErrorHandler(app);

startExpressServerAndSendPortToRunner(app);
