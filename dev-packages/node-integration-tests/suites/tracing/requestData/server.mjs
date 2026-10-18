import { startExpressServerAndSendPortToRunner } from '@sentry-internal/node-integration-tests';
import express from 'express';

const app = express();

app.get('/test', (_req, res) => {
  res.send({ response: 'ok' });
});

startExpressServerAndSendPortToRunner(app);
