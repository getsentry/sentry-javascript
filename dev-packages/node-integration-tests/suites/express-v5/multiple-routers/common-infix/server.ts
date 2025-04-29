import * as Sentry from '@sentry/node';
import { loggingTransport, startExpressServerAndSendPortToRunner } from '@sentry-internal/node-integration-tests';

Sentry.init({
  debug: true,
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  release: '1.0',
  tracesSampleRate: 1.0,
  transport: loggingTransport,
});

import cors from 'cors';
import express from 'express';

const app = express();

app.use(cors());

const APIv1 = express.Router();

APIv1.get('/test', function (_req, res) {
  Sentry.captureMessage('Custom Message');
  res.send('Success');
});

const root = express.Router();

app.use('/api/v1', root);
app.use('/api2/v1', APIv1);

Sentry.setupExpressErrorHandler(app);

startExpressServerAndSendPortToRunner(app);
