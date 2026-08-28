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

// Deprecated, and here with a permissive (default) predicate that would capture both errors. But the
// channel-based `expressIntegration` (configured with `shouldHandleError: error_2` in the instrument)
// takes precedence: it is the single registered handler, so its predicate decides what is captured and
// this middleware must neither capture `error_1` nor double-capture `error_2`.
Sentry.setupExpressErrorHandler(app);

startExpressServerAndSendPortToRunner(app);
