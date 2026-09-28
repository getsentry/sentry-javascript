import { startExpressServerAndSendPortToRunner } from '@sentry-internal/node-integration-tests';
import * as Sentry from '@sentry/node';
import express from 'express';

const app = express();

app.get('/test', (_req, res) => {
  Sentry.startSpan({ name: 'child-span' }, () => {
    // noop
  });
  res.send({ response: 'ok' });
});

startExpressServerAndSendPortToRunner(app);
