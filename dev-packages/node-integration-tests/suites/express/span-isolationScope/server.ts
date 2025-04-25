import { loggingTransport } from '@sentry-internal/node-integration-tests';
import * as Sentry from '@sentry/node';

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  release: '1.0',
  tracesSampleRate: 1.0,
  transport: loggingTransport,
});

import { startExpressServerAndSendPortToRunner } from '@sentry-internal/node-integration-tests';
import express from 'express';

const app = express();

Sentry.setTag('global', 'tag');

app.get('/test/isolationScope', (_req, res) => {
  // eslint-disable-next-line no-console
  console.log('This is a test log.');
  Sentry.addBreadcrumb({ message: 'manual breadcrumb' });
  Sentry.setTag('isolation-scope', 'tag');

  res.send({});
});

Sentry.setupExpressErrorHandler(app);

startExpressServerAndSendPortToRunner(app);
