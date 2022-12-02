import express from 'express';
// import * as Sentry from '@sentry/node';
// import { SentryPropagator, SentrySpanProcessor } from '@sentry/opentelemetry-node';
import * as opentelemetry from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';

// Sentry.init({ dsn: process.env.E2E_TEST_DSN, instrumenter: 'otel' });

const sdk = new opentelemetry.NodeSDK({
  traceExporter: new opentelemetry.tracing.ConsoleSpanExporter(),
  instrumentations: [getNodeAutoInstrumentations()],

  // Sentry config
  // spanProcessor: new SentrySpanProcessor(),
  // textMapPropagator: new SentryPropagator(),
});

sdk.start();

const app = express();

const port = 4000;

// The request handler must be the first middleware on the app
// app.use(Sentry.Handlers.requestHandler());

app.get('/', (_req, res) => {
  res.send('GET request to /');
});

app.post('/item', (_req, res) => {
  res.send('POST request to /item');
});

app.get('/users/:id', (req, res) => {
  res.send(`GET request with id of ${req.params.id} to /users/:id`);
});

app.get('/error', (_req, res) => {
  const error = new Error('GET request to /error');
  // Sentry.captureException(error);
  res.status(500).send('GET request with error to /error');
});

// The error handler must be before any other error middleware and after all controllers
// app.use(Sentry.Handlers.errorHandler());

app.listen(port, () => {
  console.log(`App is listening on port ${port}`);
});
