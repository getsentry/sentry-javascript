import * as Sentry from '@sentry/node';
import { startExpressServerAndSendPortToRunner } from '@sentry-internal/node-integration-tests';
import express from 'express';

const app = express();

app.get('/test/slow', async (_req, res) => {
  await Sentry.startSpan({ name: 'slow-work', op: 'function' }, () => new Promise(resolve => setTimeout(resolve, 500)));
  res.send('ok');
});

startExpressServerAndSendPortToRunner(app);
