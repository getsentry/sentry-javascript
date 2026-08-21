import * as Sentry from '@sentry/node';
import { startExpressServerAndSendPortToRunner } from '@sentry-internal/node-integration-tests';
import express from 'express';

const app = express();

Sentry.setTag('global', 'tag');

app.get('/test/express/:id', req => {
  throw new Error(`test_error with id ${req.params.id}`);
});

app.get('/test/withScope', () => {
  Sentry.withScope(scope => {
    scope.setTag('local', 'tag');
    throw new Error('test_error');
  });
});

app.get('/test/isolationScope', () => {
  Sentry.getIsolationScope().setTag('isolation-scope', 'tag');
  throw new Error('isolation_test_error');
});

app.get('/test/withIsolationScope', () => {
  Sentry.withIsolationScope(iScope => {
    iScope.setTag('with-isolation-scope', 'tag');
    throw new Error('with_isolation_scope_test_error');
  });
});

// Deprecated but still supported
Sentry.setupExpressErrorHandler(app);

startExpressServerAndSendPortToRunner(app);
