import * as Sentry from '@sentry/node';
import { loggingTransport } from '@sentry-internal/node-integration-tests';

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  release: '1.0',
  tracesSampleRate: 1.0,
  transport: loggingTransport,
});

Sentry.startSpan({ name: 'parent' }, () => {
  for (let i = 0; i < 5000; i++) {
    Sentry.startInactiveSpan({ name: `child ${i}` }).end();
  }
});
