import * as Sentry from '@sentry/node-core';
import { loggingTransport } from '@sentry-internal/node-integration-tests';
import { setupOtel } from '../../../../utils/setupOtel';

const client = Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  release: '1.0',
  transport: loggingTransport,
});

setupOtel(client);

Sentry.setUser({ id: 'qux' });
Sentry.captureMessage('root_before');

Sentry.withScope(scope => {
  scope.setTag('foo', false);
  Sentry.captureMessage('outer_before');

  Sentry.withScope(scope => {
    scope.setTag('bar', 10);
    scope.setUser(null);
    Sentry.captureMessage('inner');
  });

  scope.setUser({ id: 'baz' });
  Sentry.captureMessage('outer_after');
});

Sentry.captureMessage('root_after');
