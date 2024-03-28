import { loggingTransport } from '@sentry-internal/node-integration-tests';
import * as Sentry from '@sentry/node';

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  release: '1.0',
  integrations: [
    // TODO: This used to use the Express integration
  ],
  tracesSampleRate: 1.0,
  transport: loggingTransport,
});

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
