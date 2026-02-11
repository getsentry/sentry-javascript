const { loggingTransport } = require('@sentry-internal/node-core-integration-tests');
const Sentry = require('@sentry/node-core');
const { setupOtel } = require('../../../../utils/setupOtel.js');

const client = Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  transport: loggingTransport,
});

setupOtel(client);

// express must be required after Sentry is initialized
const express = require('express');
const cors = require('cors');
const {
  startExpressServerAndSendPortToRunner,
  getPortAppIsRunningOn,
} = require('@sentry-internal/node-core-integration-tests');

const app = express();

app.use(cors());

app.get('/check', (req, res) => {
  const appPort = getPortAppIsRunningOn(app);

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

startExpressServerAndSendPortToRunner(app);
