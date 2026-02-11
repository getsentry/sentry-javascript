import * as Sentry from '@sentry/node-core';
import { loggingTransport } from '@sentry-internal/node-integration-tests';
import { setupOtel } from '../../../../utils/setupOtel';

const client = Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  release: '1.0',
  transport: loggingTransport,
});

setupOtel(client);

Sentry.setExtra('extra_1', {
  foo: 'bar',
  baz: {
    qux: 'quux',
  },
});

Sentry.setExtra('extra_2', false);

Sentry.captureMessage('multiple_extras');
