import * as Sentry from '@sentry/node';
import { loggingTransport } from '@sentry-internal/node-integration-tests';

// Intentionally no `expressIntegration()` and no tracing: this isolates the deprecated
// `setupExpressErrorHandler` middleware so it is the sole error capturer (mechanism
// `auto.middleware.express`), rather than the channel-based auto capture (`auto.http.express`).
Sentry.init({
  traceLifecycle: 'static',
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  release: '1.0',
  transport: loggingTransport,
});
