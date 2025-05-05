import * as Sentry from '@sentry/node';
import { loggingTransport, startExpressServerAndSendPortToRunner } from '@sentry-internal/node-integration-tests';

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  release: '1.0',
  transport: loggingTransport,
  integrations: [
    Sentry.httpIntegration({
      // Flush after 2 seconds (to avoid waiting for the default 60s)
      sessionFlushingDelayMS: 2_000,
    }),
  ],
});

import express from 'express';

const app = express();

app.get('/test/success', (_req, res) => {
  res.send('Success!');
});

app.get('/test/success_next', (_req, res, next) => {
  res.send('Success!');
  next();
});

app.get('/test/success_slow', async (_req, res) => {
  await new Promise(res => setTimeout(res, 50));

  res.send('Success!');
});

app.get('/test/error_unhandled', () => {
  throw new Error('Crash!');
});

app.get('/test/error_handled', (_req, res) => {
  try {
    throw new Error('Crash!');
  } catch (e) {
    Sentry.captureException(e);
  }
  res.send('Crash!');
});

Sentry.setupExpressErrorHandler(app);

startExpressServerAndSendPortToRunner(app);
