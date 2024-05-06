import { loggingTransport } from '@sentry-internal/node-integration-tests';
import * as Sentry from '@sentry/node';

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  release: '1.0',
  transport: loggingTransport,
});

import { startExpressServerAndSendPortToRunner } from '@sentry-internal/node-integration-tests';
import express from 'express';

const app = express();

app.get('/test/success', (req, res) => {
  res.send({ response: 'response 3' });
});

Sentry.setupExpressErrorHandler(app);

startExpressServerAndSendPortToRunner(app);
