import * as Sentry from '@sentry/node';
import { startExpressServerAndSendPortToRunner } from '@sentry-internal/node-integration-tests';
import cors from 'cors';
import express from 'express';

const app = express();

app.use(cors());

app.get('/test1', (_req, _res) => {
  // 4xx errors are skipped by the default predicate
  const error = new Error('error_1');
  error.statusCode = 404;
  throw error;
});

app.get('/test2', (_req, _res) => {
  throw new Error('error_2');
});

// With `expressIntegration` disabled (see the instrument file), the deprecated middleware is the sole
// capturer. It has no `shouldHandleError` of its own, so the default predicate applies: 5xx and
// status-less errors are captured, 3xx/4xx are not.
Sentry.setupExpressErrorHandler(app);

startExpressServerAndSendPortToRunner(app);
