import http from 'http';
import { loggingTransport, startExpressServerAndSendPortToRunner } from '@sentry-internal/node-integration-tests';
import { SEMANTIC_ATTRIBUTE_SENTRY_SOURCE } from '@sentry/core';
import * as Sentry from '@sentry/node';
import cors from 'cors';
import express from 'express';

const app = express();

export type TestAPIResponse = { test_data: { host: string; 'sentry-trace': string; baggage: string } };

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  release: '1.0',
  environment: 'prod',
  // disable requests to /express
  tracePropagationTargets: [/^(?!.*express).*$/],
  integrations: [Sentry.httpIntegration({ tracing: true }), new Sentry.Integrations.Express({ app })],
  tracesSampleRate: 1.0,
  // TODO: We're rethinking the mechanism for including Pii data in DSC, hence commenting out sendDefaultPii for now
  // sendDefaultPii: true,
  transport: loggingTransport,
});

Sentry.setUser({ id: 'user123' });

app.use(Sentry.Handlers.requestHandler());
app.use(Sentry.Handlers.tracingHandler());

app.use(cors());

app.get('/test/express', (_req, res) => {
  // eslint-disable-next-line deprecation/deprecation
  const transaction = Sentry.getCurrentScope().getTransaction();
  if (transaction) {
    // eslint-disable-next-line deprecation/deprecation
    transaction.traceId = '86f39e84263a4de99c326acab3bfe3bd';
    transaction.setAttribute(SEMANTIC_ATTRIBUTE_SENTRY_SOURCE, 'route');
  }
  const headers = http.get('http://somewhere.not.sentry/').getHeaders();

  // Responding with the headers outgoing request headers back to the assertions.
  res.send({ test_data: headers });
});

app.use(Sentry.Handlers.errorHandler());

startExpressServerAndSendPortToRunner(app);
