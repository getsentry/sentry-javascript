import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import * as opentelemetry from '@opentelemetry/sdk-node';
import * as Sentry from '@sentry/node';
import { SentryPropagator, SentrySpanProcessor } from '@sentry/opentelemetry-node';
import cors from 'cors';
import express from 'express';
import { trace } from '@opentelemetry/api';
import { diag, DiagConsoleLogger, DiagLogLevel } from '@opentelemetry/api';

// For troubleshooting, set the log level to DiagLogLevel.DEBUG
diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.DEBUG);

Sentry.init({
  debug: true,
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  defaultIntegrations: false,
  release: '1.0',
  // instrumenter: 'otel',
  tracesSampleRate: 1.0,
});

const sdk = new opentelemetry.NodeSDK({
  traceExporter: new opentelemetry.tracing.ConsoleSpanExporter(),
  instrumentations: [getNodeAutoInstrumentations()],

  // Sentry config
  spanProcessor: new SentrySpanProcessor(),
  textMapPropagator: new SentryPropagator(),
});

sdk.start().then(() => {
  console.log('OpenTelemetry started');
});

const app = express();

app.use(Sentry.Handlers.requestHandler());
app.use(Sentry.Handlers.tracingHandler());

app.use(cors());

app.get('/test/express', (_req, res) => {
  console.log(trace.getActiveSpan());
  res.send({ response: 'response 1' });
});

app.get(/\/test\/regex/, (_req, res) => {
  res.send({ response: 'response 2' });
});

app.get(['/test/array1', /\/test\/array[2-9]/], (_req, res) => {
  res.send({ response: 'response 3' });
});

app.get(['/test/arr/:id', /\/test\/arr[0-9]*\/required(path)?(\/optionalPath)?\/(lastParam)?/], (_req, res) => {
  res.send({ response: 'response 4' });
});

app.use(Sentry.Handlers.errorHandler());

export default app;
