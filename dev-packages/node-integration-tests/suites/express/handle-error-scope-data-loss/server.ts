import * as Sentry from '@sentry/node';
import { loggingTransport, startExpressServerAndSendPortToRunner } from '@sentry-internal/node-integration-tests';

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  release: '1.0',
  transport: loggingTransport,
});

import express from 'express';

const app = express();

Sentry.setTag('global', 'tag');

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

Sentry.setupExpressErrorHandler(app);

startExpressServerAndSendPortToRunner(app);
