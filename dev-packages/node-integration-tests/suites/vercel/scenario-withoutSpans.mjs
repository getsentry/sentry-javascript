import * as Sentry from '@sentry/node';
import { startExpressServerAndSendPortToRunner } from '@sentry-internal/node-integration-tests';
import express from 'express';

const app = express();

app.get('/test/error', () => {
  throw new Error('test error');
});

Sentry.setupExpressErrorHandler(app);

startExpressServerAndSendPortToRunner(app);
