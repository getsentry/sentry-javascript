import * as Sentry from '@sentry/node';
import { startExpressServerAndSendPortToRunner } from '@sentry-internal/node-integration-tests';
import cors from 'cors';
import express from 'express';

const app = express();

app.use(cors());

app.get('/test1', (_req, _res) => {
  throw new Error('error_1');
});

app.get('/test2', (_req, _res) => {
  throw new Error('error_2');
});

// Deprecated but still supported: capture route errors via the error-handling middleware.
Sentry.setupExpressErrorHandler(app, {
  shouldHandleError: error => error.message === 'error_2',
});

startExpressServerAndSendPortToRunner(app);
