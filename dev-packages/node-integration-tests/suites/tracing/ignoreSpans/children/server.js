const { loggingTransport } = require('@sentry-internal/node-integration-tests');
const Sentry = require('@sentry/node');

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  release: '1.0',
  tracePropagationTargets: [/^(?!.*test).*$/],
  tracesSampleRate: 1.0,
  transport: loggingTransport,
  traceLifecycle: 'stream',
  ignoreSpans: ['middleware - expressInit', 'custom-to-drop'],
  clientReportFlushInterval: 1_000,
});

const express = require('express');
const cors = require('cors');
const { startExpressServerAndSendPortToRunner } = require('@sentry-internal/node-integration-tests');

const app = express();

app.use(cors());

app.get('/test/express', (_req, res) => {
  Sentry.startSpan(
    {
      name: 'custom-to-drop',
      op: 'custom',
    },
    () => {
      Sentry.startSpan(
        {
          name: 'custom',
          op: 'custom',
        },
        () => {},
      );
    },
  );
  res.send({ response: 'response 1' });
});

Sentry.setupExpressErrorHandler(app);

startExpressServerAndSendPortToRunner(app);
