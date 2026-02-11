import * as Sentry from '@sentry/node-core';
import { loggingTransport } from '@sentry-internal/node-integration-tests';
import { setupOtel } from '../../../../utils/setupOtel';

const client = Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  release: '1.0',
  transport: loggingTransport,
});

setupOtel(client);

Sentry.setExtras({ extra: [] });
Sentry.setExtras({ null: 0 });
Sentry.setExtras({
  obj: {
    foo: ['bar', 'baz', 1],
  },
});
Sentry.setExtras({ [Infinity]: 2 });

Sentry.captureMessage('consecutive_calls');
