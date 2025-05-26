import * as Sentry from '@sentry/node-core';
import { loggingTransport } from '@sentry-internal/node-core-otel-v2-integration-tests';

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  release: '1.0',
  transport: loggingTransport,
});

const scope = Sentry.getCurrentScope();
scope.setTag('foo', 'bar');
scope.setUser({ id: 'baz' });
scope.setExtra('qux', 'quux');
scope.clear();

Sentry.captureMessage('cleared_scope');
