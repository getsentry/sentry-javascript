import * as Sentry from '@sentry/node';
import { loggingTransport } from '@sentry-internal/node-integration-tests';

const requestHook = (span, sanitizedSqlQuery, connectionContext) => {
  // Add custom attributes to demonstrate requestHook functionality.
  // Streamed spans carry no `extra`, so the connection context is asserted via span attributes
  // rather than `Sentry.setExtra` (as the static-lifecycle suite does).
  span.setAttributes({
    'custom.requestHook': 'called',
    'custom.requestHook.query': sanitizedSqlQuery,
    'custom.requestHook.database': connectionContext?.ATTR_DB_NAMESPACE,
    'custom.requestHook.host': connectionContext?.ATTR_SERVER_ADDRESS,
    'custom.requestHook.port': connectionContext?.ATTR_SERVER_PORT,
  });
};

// `postgresJsIntegration()` is the diagnostics-channel implementation by default; it forwards the
// `requestHook` to the channel subscriber.
Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  release: '1.0',
  tracesSampleRate: 1.0,
  transport: loggingTransport,
  integrations: [Sentry.postgresJsIntegration({ requestHook })],
  traceLifecycle: 'stream',
});
