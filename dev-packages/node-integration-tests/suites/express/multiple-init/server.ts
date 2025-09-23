import * as Sentry from '@sentry/node';
import { loggingTransport, startExpressServerAndSendPortToRunner } from '@sentry-internal/node-integration-tests';

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
  initialCurrentScope.setClient(Sentry.getClient());

  Sentry.addBreadcrumb({ message: 'init breadcrumb' });
  Sentry.setTag('init', 'tag');

  res.send({});
});

app.get('/test/error/:id', (req, res) => {
  const id = req.params.id;
  Sentry.addBreadcrumb({ message: `error breadcrumb ${id}` });
  Sentry.setTag('error', id);

  Sentry.captureException(new Error(`This is an exception ${id}`));

  setTimeout(() => {
    // We flush to ensure we are sending exceptions in a certain order
    Sentry.flush(1000).then(
      () => {
        // We send this so we can wait for this, to know the test is ended & server can be closed
        if (id === '3') {
          Sentry.captureException(new Error('Final exception was captured'));
        }
        res.send({});
      },
      () => {
        res.send({});
      },
    );
  }, 1);
});

Sentry.setupExpressErrorHandler(app);

startExpressServerAndSendPortToRunner(app);
