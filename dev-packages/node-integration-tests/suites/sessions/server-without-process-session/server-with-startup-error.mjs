import * as Sentry from '@sentry/node';
import { startExpressServerAndSendPortToRunner } from '@sentry-internal/node-integration-tests';
import express from 'express';

Sentry.captureException(new Error('Startup error'));
// Event processing is async; make sure the error has updated the process session before the first request.
await Sentry.flush();

const app = express();

app.get('/test/success', (_req, res) => {
  res.send('Success!');
});

app.get('/test/error_handled', (_req, res) => {
  Sentry.captureException(new Error('Request error'));
  res.send('Handled!');
});

startExpressServerAndSendPortToRunner(app);
