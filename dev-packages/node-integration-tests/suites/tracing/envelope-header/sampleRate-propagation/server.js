const { loggingTransport } = require('@sentry-internal/node-integration-tests');
const Sentry = require('@sentry/node');

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  release: '1.0',
  // disable attaching headers to /test/* endpoints
  tracePropagationTargets: [/^(?!.*test).*$/],
  tracesSampleRate: 1.0,
  transport: loggingTransport,
});

// express must be required after Sentry is initialized
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const { startExpressServerAndSendPortToRunner } = require('@sentry-internal/node-integration-tests');

const app = express();

app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.text());
app.use(bodyParser.raw());

app.get('/test', (req, res) => {
  res.send({ headers: req.headers });
});

Sentry.setupExpressErrorHandler(app);

startExpressServerAndSendPortToRunner(app);
