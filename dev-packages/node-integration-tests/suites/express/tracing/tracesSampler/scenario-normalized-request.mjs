import * as Sentry from '@sentry/node';
import { startExpressServerAndSendPortToRunner } from '@sentry-internal/node-integration-tests';
import cors from 'cors';
import express from 'express';

const app = express();

app.use(cors());

app.get('/test-normalized-request', (_req, res) => {
  res.send('Success');
});

Sentry.setupExpressErrorHandler(app);

startExpressServerAndSendPortToRunner(app);
