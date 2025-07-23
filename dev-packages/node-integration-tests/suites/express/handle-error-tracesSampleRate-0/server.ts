import * as Sentry from '@sentry/node';
import { loggingTransport, startExpressServerAndSendPortToRunner } from '@sentry-internal/node-integration-tests';

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  release: '1.0',
  transport: loggingTransport,
  tracesSampleRate: 0,
});

import express from 'express';

const app = express();

app.get('/test/express/:id', req => {
  throw new Error(`test_error with id ${req.params.id}`);
});

Sentry.setupExpressErrorHandler(app);

startExpressServerAndSendPortToRunner(app);
