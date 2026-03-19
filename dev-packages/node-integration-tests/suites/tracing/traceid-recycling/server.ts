import * as Sentry from '@sentry/node';
import { loggingTransport, startExpressServerAndSendPortToRunner } from '@sentry-internal/node-integration-tests';

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  release: '1.0',
  transport: loggingTransport,
});

import express from 'express';

const app = express();

app.get('/test', (_req, res) => {
  Sentry.captureException(new Error('test error'));
  const traceId = Sentry.getCurrentScope().getPropagationContext().traceId;
  res.json({ traceId });
});

startExpressServerAndSendPortToRunner(app);
