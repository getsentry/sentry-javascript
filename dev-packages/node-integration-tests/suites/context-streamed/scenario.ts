import * as Sentry from '@sentry/node';
import { loggingTransport } from '@sentry-internal/node-integration-tests';

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  tracesSampleRate: 1.0,
  traceLifecycle: 'stream',
  transport: loggingTransport,
});

Sentry.startSpan({ name: 'test-span' }, () => {
  // noop
});

void Sentry.flush();
