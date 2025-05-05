import * as Sentry from '@sentry/node';
import { loggingTransport, startExpressServerAndSendPortToRunner } from '@sentry-internal/node-integration-tests';

export type TestAPIResponse = { test_data: { host: string; 'sentry-trace': string; baggage: string } };

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  release: '1.0',
  environment: 'prod',
  tracePropagationTargets: [/^(?!.*express).*$/],
  tracesSampleRate: 1.0,
  transport: loggingTransport,
});

import cors from 'cors';
import express from 'express';
import http from 'http';

const app = express();

app.use(cors());

app.get('/test/express', (_req, res) => {
  const headers = http.get('http://somewhere.not.sentry/').getHeaders();

  // Responding with the headers outgoing request headers back to the assertions.
  res.send({ test_data: headers });
});

Sentry.setupExpressErrorHandler(app);

startExpressServerAndSendPortToRunner(app);
