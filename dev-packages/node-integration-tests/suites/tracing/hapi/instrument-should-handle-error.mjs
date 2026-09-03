import * as Sentry from '@sentry/node';
import { loggingTransport } from '@sentry-internal/node-integration-tests';

Sentry.init({
  traceLifecycle: 'static',
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  release: '1.0',
  tracesSampleRate: 1.0,
  transport: loggingTransport,
  integrations: [
    // Drop the "Dropped error" — the default predicate would capture it (it's a 5xx). This custom
    // predicate must win over the default one installed by the earlier `setupHapiErrorHandler` call.
    Sentry.hapiIntegration({
      shouldHandleError: error => error?.message !== 'Dropped error',
    }),
  ],
});
