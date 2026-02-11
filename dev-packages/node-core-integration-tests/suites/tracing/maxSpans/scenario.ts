import * as Sentry from '@sentry/node-core';
import { loggingTransport } from '@sentry-internal/node-core-integration-tests';
import { setupOtel } from '../../../utils/setupOtel';

const client = Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  release: '1.0',
  tracesSampleRate: 1.0,
  transport: loggingTransport,
});

setupOtel(client);

Sentry.startSpan({ name: 'parent' }, () => {
  for (let i = 0; i < 5000; i++) {
    Sentry.startInactiveSpan({ name: `child ${i}` }).end();
  }
});
