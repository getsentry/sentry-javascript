import { loggingTransport } from '@sentry-internal/node-integration-tests';
import * as Sentry from '@sentry/node';

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  release: '1.0',
  integrations: [
    // TODO: This used to have the Express integration
  ],
  tracesSampleRate: 1.0,
  transport: loggingTransport,
});

import { startExpressServerAndSendPortToRunner } from '@sentry-internal/node-integration-tests';
import cors from 'cors';
import express from 'express';

const app = express();

app.use(cors());

const APIv1 = express.Router();

APIv1.get('/:userId', function (_req, res) {
  Sentry.captureMessage('Custom Message');
  res.send('Success');
});

const root = express.Router();

app.use('/api/v1', APIv1);
app.use('/api', root);

Sentry.setupExpressErrorHandler(app);

startExpressServerAndSendPortToRunner(app);
