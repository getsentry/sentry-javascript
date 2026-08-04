import * as Sentry from '@sentry/node';
import { loggingTransport } from '@sentry-internal/node-integration-tests';

// `tracesSampleRate: 1.0` turns on span recording, so `init()` registers the
// runtime module hook. The scenario then checks that the channel subscribers
// are NOT wired up until the instrumented module is actually loaded.
Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  release: '1.0',
  tracesSampleRate: 1.0,
  transport: loggingTransport,
});
