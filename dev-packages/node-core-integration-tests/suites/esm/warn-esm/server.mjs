import * as Sentry from '@sentry/node-core';
import { loggingTransport, startExpressServerAndSendPortToRunner } from '@sentry-internal/node-integration-tests';
import express from 'express';
import { setupOtel } from '../../../utils/setupOtel.js';

const client = Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  release: '1.0',
  transport: loggingTransport,
});

setupOtel(client);

const app = express();

app.get('/test/success', (req, res) => {
  res.send({ response: 'response 3' });
});

startExpressServerAndSendPortToRunner(app);
