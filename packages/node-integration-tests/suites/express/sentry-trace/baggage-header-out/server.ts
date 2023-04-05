import * as Sentry from '@sentry/node';
import * as Tracing from '@sentry/tracing';
import cors from 'cors';
import express from 'express';
import http from 'http';

const app = express();

export type TestAPIResponse = { test_data: { host: string; 'sentry-trace': string; baggage: string } };

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  release: '1.0',
  environment: 'prod',
  // eslint-disable-next-line deprecation/deprecation
  integrations: [new Sentry.Integrations.Http({ tracing: true }), new Tracing.Integrations.Express({ app })],
  tracesSampleRate: 1.0,
});

Sentry.setUser({ id: 'user123', segment: 'SegmentA' });

app.use(Sentry.Handlers.requestHandler());
app.use(Sentry.Handlers.tracingHandler());

app.use(cors());

app.get('/test/express', (_req, res) => {
  const transaction = Sentry.getCurrentHub().getScope()?.getTransaction();
  if (transaction) {
    transaction.traceId = '86f39e84263a4de99c326acab3bfe3bd';
  }
  const headers = http.get('http://somewhere.not.sentry/').getHeaders();

  // Responding with the headers outgoing request headers back to the assertions.
  res.send({ test_data: headers });
});

app.use(Sentry.Handlers.errorHandler());

export default app;
