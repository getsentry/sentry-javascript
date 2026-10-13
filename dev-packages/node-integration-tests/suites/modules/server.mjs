import { startExpressServerAndSendPortToRunner } from '@sentry-internal/node-integration-tests';
import express from 'express';

const app = express();

app.get('/test1', () => {
  throw new Error('error_1');
});

startExpressServerAndSendPortToRunner(app);
