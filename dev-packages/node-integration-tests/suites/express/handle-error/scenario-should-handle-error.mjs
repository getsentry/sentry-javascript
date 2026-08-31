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

// `shouldHandleError` is configured on `expressIntegration` (see the instrument file); no
// error handler needs to be registered on the app anymore.

startExpressServerAndSendPortToRunner(app);
