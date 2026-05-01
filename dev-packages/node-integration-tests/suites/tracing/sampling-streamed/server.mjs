import express from 'express';
import cors from 'cors';
import * as Sentry from '@sentry/node';
import { startExpressServerAndSendPortToRunner } from '@sentry-internal/node-integration-tests';

const app = express();

app.use(cors());

app.get('/health', (_req, res) => {
  res.send({ status: 'ok-health' });
});

app.get('/ok', (_req, res) => {
  res.send({ status: 'ok' });
});

Sentry.setupExpressErrorHandler(app);

startExpressServerAndSendPortToRunner(app);
