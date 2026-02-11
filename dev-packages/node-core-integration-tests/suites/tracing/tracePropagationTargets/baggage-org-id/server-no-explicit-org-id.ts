import * as Sentry from '@sentry/node-core';
import { loggingTransport, startExpressServerAndSendPortToRunner } from '@sentry-internal/node-core-integration-tests';
import { setupOtel } from '../../../../utils/setupOtel';

export type TestAPIResponse = { test_data: { host: string; 'sentry-trace': string; baggage: string } };

const client = Sentry.init({
  dsn: 'https://public@o01234987.ingest.sentry.io/1337',
  release: '1.0',
  environment: 'prod',
  tracesSampleRate: 1.0,
  transport: loggingTransport,
});

setupOtel(client);

import cors from 'cors';
import express from 'express';
import * as http from 'http';

const app = express();

app.use(cors());

app.get('/test/express', (_req, res) => {
  const headers = http
    .get({
      hostname: 'example.com',
    })
    .getHeaders();

  res.send({ test_data: headers });
});

startExpressServerAndSendPortToRunner(app);
