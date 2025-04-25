import { loggingTransport } from '@sentry-internal/node-integration-tests';
import * as Sentry from '@sentry/node';

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  release: '1.0',
  transport: loggingTransport,
});

Sentry.setUser({
  id: 'foo',
  ip_address: 'bar',
});

Sentry.captureMessage('first_user');

Sentry.setUser({
  id: 'baz',
});

Sentry.captureMessage('second_user');
