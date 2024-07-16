const { loggingTransport } = require('@sentry-internal/node-integration-tests');
const Sentry = require('@sentry/node');

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  release: '1.0',
  tracesSampleRate: 1.0,
  transport: loggingTransport,

  integrations: [
    Sentry.httpIntegration({
      ignoreIncomingRequests: (url, request) => {
        if (url.includes('/liveness')) {
          return true;
        }
        if (request.method === 'POST' && request.url.includes('readiness')) {
          return true;
        }
        return false;
      },
    }),
  ],
});

// express must be required after Sentry is initialized
const express = require('express');
const cors = require('cors');
const { startExpressServerAndSendPortToRunner } = require('@sentry-internal/node-integration-tests');

const app = express();

app.use(cors());

app.get('/test', (_req, res) => {
  res.send({ response: 'response 1' });
});

app.get('/liveness', (_req, res) => {
  res.send({ response: 'liveness' });
});

app.post('/readiness', (_req, res) => {
  res.send({ response: 'readiness' });
});

Sentry.setupExpressErrorHandler(app);

startExpressServerAndSendPortToRunner(app);
