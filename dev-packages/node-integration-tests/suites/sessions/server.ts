import { loggingTransport } from '@sentry-internal/node-integration-tests';
import type { SessionFlusher } from '@sentry/core';
import * as Sentry from '@sentry/node';

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  release: '1.0',
  transport: loggingTransport,
});

import { startExpressServerAndSendPortToRunner } from '@sentry-internal/node-integration-tests';
import express from 'express';

const app = express();

const flusher = (Sentry.getClient() as Sentry.NodeClient)['_sessionFlusher'] as SessionFlusher;

// Flush after 2 seconds (to avoid waiting for the default 60s)
setTimeout(() => {
  flusher?.flush();
}, 2000);

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
