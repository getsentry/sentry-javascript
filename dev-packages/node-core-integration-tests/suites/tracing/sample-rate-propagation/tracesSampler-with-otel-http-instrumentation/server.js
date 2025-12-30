const { loggingTransport } = require('@sentry-internal/node-core-integration-tests');
const { HttpInstrumentation } = require('@opentelemetry/instrumentation-http');
const Sentry = require('@sentry/node-core');
const { setupOtel } = require('../../../../utils/setupOtel.js');

const client = Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  transport: loggingTransport,
  tracesSampler: ({ inheritOrSampleWith }) => {
    return inheritOrSampleWith(0.69);
  },
  openTelemetryInstrumentations: [new HttpInstrumentation()],
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
  Sentry.startSpan({ name: 'check-endpoint' }, async () => {
    const appPort = getPortAppIsRunningOn(app);
    try {
      const response = await fetch(`http://localhost:${appPort}/bounce`);
      const bounceRes = await response.json();
      // eslint-disable-next-line no-console
      console.log('Bounce response:', bounceRes);
      res.json({ propagatedData: bounceRes });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Error fetching bounce:', err);
      res.status(500).json({ error: err.message });
    }
  });
});

app.get('/bounce', (req, res) => {
  // eslint-disable-next-line no-console
  console.log('Bounce headers:', req.headers);
  res.json({
    baggage: req.headers['baggage'],
  });
});

startExpressServerAndSendPortToRunner(app);
