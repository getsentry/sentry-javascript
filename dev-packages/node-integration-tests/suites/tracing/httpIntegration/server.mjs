import * as Sentry from '@sentry/node';
import { startExpressServerAndSendPortToRunner } from '@sentry-internal/node-integration-tests';
import cors from 'cors';
import express from 'express';

const app = express();

app.use(cors());

app.get('/test', (_req, res) => {
  res.send({ response: 'response 1' });
});

app.post('/test', (_req, res) => {
  res.send({ response: 'response 2' });
});

Sentry.setupExpressErrorHandler(app);

startExpressServerAndSendPortToRunner(app);
