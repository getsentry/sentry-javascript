import * as Sentry from '@sentry/node';
import { loggingTransport } from '@sentry-internal/node-integration-tests';

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  transport: loggingTransport,
  tracesSampler: () => {
    throw new Error('tracesSampler failed');
  },
});

Sentry.startSpan({ name: 'this should not be sampled because tracesSampler throws' }, () => {
  // no-op
});

// eslint-disable-next-line @typescript-eslint/no-floating-promises
Sentry.flush();
