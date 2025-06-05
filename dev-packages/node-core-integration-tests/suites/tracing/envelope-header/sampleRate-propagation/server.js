const { loggingTransport } = require('@sentry-internal/node-integration-tests');
const Sentry = require('@sentry/node-core');
const { setupOtel } = require('../../../../utils/setupOtel.js');

const client = Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  release: '1.0',
  // disable attaching headers to /test/* endpoints
  tracePropagationTargets: [/^(?!.*test).*$/],
  tracesSampleRate: 1.0,
  transport: loggingTransport,
});

setupOtel(client);

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

startExpressServerAndSendPortToRunner(app);
