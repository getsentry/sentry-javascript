import * as Sentry from '@sentry/node';
import { startExpressServerAndSendPortToRunner } from '@sentry-internal/node-integration-tests';
import express from 'express';

Sentry.captureException(new Error('Startup error'));

const app = express();

app.get('/test/success', (_req, res) => {
  res.send('Success!');
});

startExpressServerAndSendPortToRunner(app);
