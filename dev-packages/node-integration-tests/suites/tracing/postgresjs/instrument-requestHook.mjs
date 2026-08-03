import * as Sentry from '@sentry/node';
import { loggingTransport } from '@sentry-internal/node-integration-tests';

const requestHook = (span, sanitizedSqlQuery, connectionContext) => {
  // Add custom attributes to demonstrate requestHook functionality
  span.setAttribute('custom.requestHook', 'called');

  // Set context information as extras for test validation
  Sentry.setExtra('requestHookCalled', {
    sanitizedQuery: sanitizedSqlQuery,
    database: connectionContext?.ATTR_DB_NAMESPACE,
    host: connectionContext?.ATTR_SERVER_ADDRESS,
    port: connectionContext?.ATTR_SERVER_PORT,
  });
};

// `postgresJsIntegration()` is the diagnostics-channel implementation by default; it forwards the
// `requestHook` to the channel subscriber.
Sentry.init({
  traceLifecycle: 'static',
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  release: '1.0',
  tracesSampleRate: 1.0,
  transport: loggingTransport,
  integrations: [Sentry.postgresJsIntegration({ requestHook })],
});
