import { loggingTransport } from '@sentry-internal/node-integration-tests';
import * as Sentry from '@sentry/node';

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  release: '1.0',
  transport: loggingTransport,
});

Sentry.captureMessage('no_user');

Sentry.setUser({
  id: 'foo',
  ip_address: 'bar',
  other_key: 'baz',
});

Sentry.captureMessage('user');

Sentry.setUser(null);

Sentry.captureMessage('unset_user');
