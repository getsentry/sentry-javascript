import { loggingTransport } from '@sentry-internal/node-integration-tests';
import * as Sentry from '@sentry/node';

Sentry.init({
  // No dsn, means  client is disabled
  // dsn: 'https://public@dsn.ingest.sentry.io/1337',
  release: '1.0',
  transport: loggingTransport,
});

// We add http integration to ensure request isolation etc. works
const initialClient = Sentry.getClient();
initialClient?.addIntegration(Sentry.httpIntegration());

// Store this so we can update the client later
const initialCurrentScope = Sentry.getCurrentScope();

import { startExpressServerAndSendPortToRunner } from '@sentry-internal/node-integration-tests';
import express from 'express';

const app = express();

Sentry.setTag('global', 'tag');

app.get('/test/no-init', (_req, res) => {
  Sentry.addBreadcrumb({ message: 'no init breadcrumb' });
  Sentry.setTag('no-init', 'tag');

  res.send({});
});

app.get('/test/init', (_req, res) => {
  // Call init again, but with DSN
  Sentry.init({
    dsn: 'https://public@dsn.ingest.sentry.io/1337',
    release: '1.0',
    transport: loggingTransport,
  });
  // Set this on initial scope, to ensure it can be inherited
  initialCurrentScope.setClient(Sentry.getClient()!);

  Sentry.addBreadcrumb({ message: 'init breadcrumb' });
  Sentry.setTag('init', 'tag');

  res.send({});
});

app.get('/test/error/:id', (req, res) => {
  const id = req.params.id;
  Sentry.addBreadcrumb({ message: `error breadcrumb ${id}` });
  Sentry.setTag('error', id);

  Sentry.captureException(new Error(`This is an exception ${id}`));

  res.send({});
});

Sentry.setupExpressErrorHandler(app);

startExpressServerAndSendPortToRunner(app);
