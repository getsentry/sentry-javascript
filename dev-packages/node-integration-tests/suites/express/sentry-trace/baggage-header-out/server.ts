import { loggingTransport, startExpressServerAndSendPortToRunner } from '@sentry-internal/node-integration-tests';
import * as Sentry from '@sentry/node';

export type TestAPIResponse = { test_data: { host: string; 'sentry-trace': string; baggage: string } };

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  release: '1.0',
  environment: 'prod',
  tracePropagationTargets: [/^(?!.*express).*$/],
  integrations: [
    // TODO: This used to use the Express integration
  ],
  tracesSampleRate: 1.0,
  transport: loggingTransport,
});

import http from 'http';
import cors from 'cors';
import express from 'express';

const app = express();

Sentry.setUser({ id: 'user123' });

app.use(cors());

app.get('/test/express', (_req, res) => {
  const span = Sentry.getActiveSpan();
  const traceId = span?.spanContext().traceId;
  const headers = http.get('http://somewhere.not.sentry/').getHeaders();
  if (traceId) {
    headers['baggage'] = (headers['baggage'] as string).replace(traceId, '__SENTRY_TRACE_ID__');
  }
  // Responding with the headers outgoing request headers back to the assertions.
  res.send({ test_data: headers });
});

Sentry.setupExpressErrorHandler(app);

startExpressServerAndSendPortToRunner(app);
