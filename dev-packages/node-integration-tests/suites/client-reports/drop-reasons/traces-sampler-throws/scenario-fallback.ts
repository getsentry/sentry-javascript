import * as Sentry from '@sentry/node';
import { loggingTransport } from '@sentry-internal/node-integration-tests';

Sentry.init({
  traceLifecycle: 'static',
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  transport: loggingTransport,
  tracesSampleRate: 1,
  tracesSampler: () => {
    throw new Error('tracesSampler failed');
  },
});

Sentry.startSpan({ name: 'sampled via tracesSampleRate fallback' }, () => {
  // no-op
});

// eslint-disable-next-line @typescript-eslint/no-floating-promises
Sentry.flush();
