import * as Sentry from '@sentry/node';
import { loggingTransport, startExpressServerAndSendPortToRunner } from '@sentry-internal/node-integration-tests';

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  release: '1.0',
  transport: loggingTransport,
  tracesSampleRate: 1.0,
});

import express from 'express';

const app = express();

app.get('/test', async (_req, res) => {
  Sentry.captureException(new Error('test error'));
  // calling Sentry.flush() here to ensure that the order in which we send transaction and errors
  // is guaranteed to be 1. error, 2. transaction (repeated 3x in test)
  await Sentry.flush();
  res.json({ success: true });
});

startExpressServerAndSendPortToRunner(app);
