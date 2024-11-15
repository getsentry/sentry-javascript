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

app.get('/test/:id/span-updateName', (_req, res) => {
  const span = Sentry.getActiveSpan();
  const rootSpan = Sentry.getRootSpan(span);
  rootSpan.updateName('new-name');
  res.send({ response: 'response 1' });
});

app.get('/test/:id/span-updateName-source', (_req, res) => {
  const span = Sentry.getActiveSpan();
  const rootSpan = Sentry.getRootSpan(span);
  rootSpan.updateName('new-name');
  rootSpan.setAttribute(Sentry.SEMANTIC_ATTRIBUTE_SENTRY_SOURCE, 'custom');
  res.send({ response: 'response 2' });
});

app.get('/test/:id/updateSpanName', (_req, res) => {
  const span = Sentry.getActiveSpan();
  const rootSpan = Sentry.getRootSpan(span);
  Sentry.updateSpanName(rootSpan, 'new-name');
  res.send({ response: 'response 3' });
});

app.get('/test/:id/updateSpanNameAndSource', (_req, res) => {
  const span = Sentry.getActiveSpan();
  const rootSpan = Sentry.getRootSpan(span);
  Sentry.updateSpanName(rootSpan, 'new-name');
  rootSpan.setAttribute(Sentry.SEMANTIC_ATTRIBUTE_SENTRY_SOURCE, 'component');
  res.send({ response: 'response 4' });
});

Sentry.setupExpressErrorHandler(app);

startExpressServerAndSendPortToRunner(app);
