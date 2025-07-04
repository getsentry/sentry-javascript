import * as Sentry from '@sentry/node-core';
import { loggingTransport } from '@sentry-internal/node-integration-tests';
import { setupOtel } from '../../../../utils/setupOtel';

const client = Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  release: '1.0',
  transport: loggingTransport,
});

setupOtel(client);

const scope = Sentry.getCurrentScope();
scope.setTag('foo', 'bar');
scope.setUser({ id: 'baz' });
scope.setExtra('qux', 'quux');

Sentry.captureMessage('configured_scope');
