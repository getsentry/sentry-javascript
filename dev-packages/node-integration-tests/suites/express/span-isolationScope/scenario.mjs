import * as Sentry from '@sentry/node';
import { startExpressServerAndSendPortToRunner } from '@sentry-internal/node-integration-tests';
import express from 'express';

const app = express();

Sentry.setAttribute('global', 'attribute');

app.get('/test/isolationScope', (_req, res) => {
  Sentry.setAttribute('isolation-scope', 'attribute');
  Sentry.setUser({ id: 'user-1' });

  res.send({});
});

startExpressServerAndSendPortToRunner(app);
