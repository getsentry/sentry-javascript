import express from 'express';
import cors from 'cors';
import * as Sentry from '@sentry/node';
import { startExpressServerAndSendPortToRunner } from '@sentry-internal/node-integration-tests';

const app = express();

app.use(cors());

app.get('/keep', (_req, res) => {
  res.send({ status: 'kept' });
  setTimeout(() => {
    // flush to avoid waiting for the span buffer timeout to send spans
    // but defer it to the next tick to let the SDK finish the http.server span first.
    Sentry.flush();
  });
});

app.post('/drop', (_req, res) => {
  res.send({ status: 'dropped' });
});

Sentry.setupExpressErrorHandler(app);

startExpressServerAndSendPortToRunner(app);
