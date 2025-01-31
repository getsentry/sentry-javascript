const { loggingTransport } = require('@sentry-internal/node-integration-tests');
const Sentry = require('@sentry/node');

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  transport: loggingTransport,
  tracesSampleRate: 0.00000001, // It's important that this is not 1, so that we also check logic for NonRecordingSpans, which is usually the edge-case
});

// express must be required after Sentry is initialized
const express = require('express');
const cors = require('cors');
const {
  startExpressServerAndSendPortToRunner,
  getPortAppIsRunningOn,
} = require('@sentry-internal/node-integration-tests');

const app = express();

app.use(cors());

app.get('/check', (req, res) => {
  const appPort = getPortAppIsRunningOn(app);
  // eslint-disable-next-line no-undef
  fetch(`http://localhost:${appPort}/bounce`)
    .then(r => r.json())
    .then(bounceRes => {
      res.json({ propagatedData: bounceRes });
    });
});

app.get('/bounce', (req, res) => {
  res.json({
    baggage: req.headers['baggage'],
  });
});

Sentry.setupExpressErrorHandler(app);

startExpressServerAndSendPortToRunner(app);
