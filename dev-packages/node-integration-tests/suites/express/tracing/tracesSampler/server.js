const { loggingTransport } = require('@sentry-internal/node-integration-tests');
const Sentry = require('@sentry/node');

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  release: '1.0',
  transport: loggingTransport,
  tracesSampler: samplingContext => {
    // The name we get here is inferred at span creation time
    // At this point, we sadly do not have a http.route attribute yet,
    // so we infer the name from the unparameterized route instead
    return (
      samplingContext.name === 'GET /test/123' &&
      samplingContext.attributes['sentry.op'] === 'http.server' &&
      samplingContext.attributes['http.method'] === 'GET'
    );
  },
  debug: true,
});

// express must be required after Sentry is initialized
const express = require('express');
const cors = require('cors');
const { startExpressServerAndSendPortToRunner } = require('@sentry-internal/node-integration-tests');

const app = express();

app.use(cors());

app.get('/test/:id', (_req, res) => {
  res.send('Success');
});

app.get('/test2', (_req, res) => {
  res.send('Success');
});

Sentry.setupExpressErrorHandler(app);

startExpressServerAndSendPortToRunner(app);
