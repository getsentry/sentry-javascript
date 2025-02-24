const { loggingTransport } = require('@sentry-internal/node-integration-tests');
const Sentry = require('@sentry/node');

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  release: '1.0',
  transport: loggingTransport,
  debug: true,
});

// express must be required after Sentry is initialized
const express = require('express');
const cors = require('cors');
const { startExpressServerAndSendPortToRunner } = require('@sentry-internal/node-integration-tests');

const app = express();

app.use(cors());

app.use((req, _res, next) => {
  // We simulate this, which would in other cases be done by some middleware
  req.user = {
    id: '1',
    email: 'test@sentry.io',
  };

  next();
});

app.get('/test1', (_req, _res) => {
  throw new Error('error_1');
});

app.use((_req, _res, next) => {
  Sentry.setUser({
    id: '2',
    email: 'test2@sentry.io',
  });

  next();
});

app.get('/test2', (_req, _res) => {
  throw new Error('error_2');
});

Sentry.setupExpressErrorHandler(app);

startExpressServerAndSendPortToRunner(app);
