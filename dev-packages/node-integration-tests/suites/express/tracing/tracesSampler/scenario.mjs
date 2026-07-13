import * as Sentry from '@sentry/node';
import { startExpressServerAndSendPortToRunner } from '@sentry-internal/node-integration-tests';
import cors from 'cors';
import express from 'express';

const app = express();

app.use(cors());

app.get('/test/:id', (_req, res) => {
  res.send('Success');
});

app.get('/test2', (_req, res) => {
  res.send('Success');
});

Sentry.setupExpressErrorHandler(app);

startExpressServerAndSendPortToRunner(app);
