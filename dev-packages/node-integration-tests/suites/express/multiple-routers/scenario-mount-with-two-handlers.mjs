import * as Sentry from '@sentry/node';
import { startExpressServerAndSendPortToRunner } from '@sentry-internal/node-integration-tests';
import express from 'express';

const app = express();

const users = express.Router();

users.get('/users/:userId', (_req, res) => {
  Sentry.captureMessage('Custom Message');
  return res.send('Success');
});

const api = express.Router();

api.use('/v1', users, (_req, res) => {
  res.status(404).send('Not found');
});

app.use('/api', api);

startExpressServerAndSendPortToRunner(app);
