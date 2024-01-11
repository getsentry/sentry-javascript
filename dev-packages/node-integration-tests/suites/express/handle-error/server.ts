import { loggingTransport, startExpressServerAndSendPortToRunner } from '@sentry-internal/node-integration-tests';
import * as Sentry from '@sentry/node';
import express from 'express';

const app = express();

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  release: '1.0',
  transport: loggingTransport,
});

app.use(Sentry.Handlers.requestHandler());

app.get('/test/express', () => {
  throw new Error('test_error');
});

app.use(Sentry.Handlers.errorHandler());

startExpressServerAndSendPortToRunner(app);
