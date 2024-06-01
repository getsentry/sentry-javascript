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

Sentry.setTag('global', 'tag');

app.get('/test/isolationScope/:id', (req, res) => {
  const id = req.params.id;
  Sentry.setTag('isolation-scope', 'tag');
  Sentry.setTag(`isolation-scope-${id}`, id);

  Sentry.captureException(new Error('This is an exception'));

  res.send({});
});

Sentry.setupExpressErrorHandler(app);

startExpressServerAndSendPortToRunner(app);
