import * as Sentry from '@sentry/node-core';
import { loggingTransport } from '@sentry-internal/node-core-integration-tests';
import { setupOtel } from '../../../../utils/setupOtel';

const client = Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  release: '1.0',
  transport: loggingTransport,
});

setupOtel(client);

Sentry.setContext('context_1', {
  foo: 'bar',
  baz: {
    qux: 'quux',
  },
});

Sentry.setContext('context_2', {
  1: 'foo',
  bar: false,
});

Sentry.setContext('context_3', null);

Sentry.captureMessage('multiple_contexts');
