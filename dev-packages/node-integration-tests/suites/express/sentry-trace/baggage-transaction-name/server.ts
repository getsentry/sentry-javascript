import { loggingTransport } from '@sentry-internal/node-integration-tests';
import * as Sentry from '@sentry/node';

export type TestAPIResponse = { test_data: { host: string; 'sentry-trace': string; baggage: string } };

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  release: '1.0',
  environment: 'prod',
  // disable requests to /express
  tracePropagationTargets: [/^(?!.*express).*$/],
  integrations: [
    // TODO: This used to use the Express integration
  ],
  tracesSampleRate: 1.0,
  // TODO: We're rethinking the mechanism for including Pii data in DSC, hence commenting out sendDefaultPii for now
  // sendDefaultPii: true,
  transport: loggingTransport,
});

import http from 'http';
import { startExpressServerAndSendPortToRunner } from '@sentry-internal/node-integration-tests';
import cors from 'cors';
import express from 'express';

const app = express();

Sentry.setUser({ id: 'user123' });

app.use(cors());

app.get('/test/express', (_req, res) => {
  const headers = http.get('http://somewhere.not.sentry/').getHeaders();
  // Responding with the headers outgoing request headers back to the assertions.
  res.send({ test_data: headers });
});

Sentry.setupExpressErrorHandler(app);

startExpressServerAndSendPortToRunner(app);
