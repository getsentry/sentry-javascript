import * as Sentry from '@sentry/node';
import { startExpressServerAndSendPortToRunner } from '@sentry-internal/node-integration-tests';
import express from 'express';

const app = express();

const APIv1 = express.Router();

APIv1.use(
  '/users/:userId',
  APIv1.get('/posts/:postId', (_req, res) => {
    Sentry.captureMessage('Custom Message');
    return res.send('Success');
  }),
);

const router = express.Router();

app.use('/api', router);
app.use('/api/api/v1', APIv1.use('/sub-router', APIv1));

Sentry.setupExpressErrorHandler(app);

startExpressServerAndSendPortToRunner(app);
