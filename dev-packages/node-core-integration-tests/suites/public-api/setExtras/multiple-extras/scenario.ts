import * as Sentry from '@sentry/node-core';
import { loggingTransport } from '@sentry-internal/node-integration-tests';
import { setupOtel } from '../../../../utils/setupOtel';

const client = Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  release: '1.0',
  transport: loggingTransport,
});

setupOtel(client);

Sentry.setExtras({
  extra_1: [1, ['foo'], 'bar'],
  extra_2: 'baz',
  extra_3: Math.PI,
  extra_4: {
    qux: {
      quux: false,
    },
  },
});

Sentry.captureMessage('multiple_extras');
