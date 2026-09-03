import * as Sentry from '@sentry/node';
import { startExpressServerAndSendPortToRunner } from '@sentry-internal/node-integration-tests';
import cors from 'cors';
import express from 'express';

const app = express();

app.use(cors());

app.use((req, _res, next) => {
  // We simulate this, which would in other cases be done by some middleware
  req.user = {
    id: '1',
    email: 'test@sentry.io',
  };

  next();
});

app.get('/test1', (_req, _res) => {
  throw new Error('error_1');
});

app.use((_req, _res, next) => {
  Sentry.setUser({
    id: '2',
    email: 'test2@sentry.io',
  });

  next();
});

app.get('/test2', (_req, _res) => {
  throw new Error('error_2');
});

startExpressServerAndSendPortToRunner(app);
