import express from 'express';
import cors from 'cors';
import { startExpressServerAndSendPortToRunner } from '@sentry-internal/node-integration-tests';

const app = express();

app.use(cors());

app.get('/health', (_req, res) => {
  res.send({ status: 'ok-health' });
});

app.get('/ok', (_req, res) => {
  res.send({ status: 'ok' });
});

startExpressServerAndSendPortToRunner(app);
