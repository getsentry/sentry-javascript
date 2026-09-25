import * as Sentry from '@sentry/node';
import { startExpressServerAndSendPortToRunner } from '@sentry-internal/node-integration-tests';
import cors from 'cors';
import express from 'express';

const app = express();

app.use(cors());

app.get('/test/:id1/:id2', (_req, res) => {
  Sentry.captureException(new Error('error_1'));
  res.send('Success');
});

startExpressServerAndSendPortToRunner(app);
