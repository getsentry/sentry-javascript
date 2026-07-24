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

// Under orchestrion (INJECT_ORCHESTRION), `experimentalUseDiagnosticsChannelInjection()` has already run
// and the default `PostgresJs` OTel integration is swapped for the channel one. Passing the OTel
// `postgresJsIntegration()` explicitly here would override that swap and silently re-test the old path,
// so use the channel integration instead — configured with the same requestHook.
const postgresJsIntegration =
  process.env.INJECT_ORCHESTRION === 'true'
    ? Sentry.diagnosticsChannelInjectionIntegrations().postgresJsIntegration({ requestHook })
    : Sentry.postgresJsIntegration({ requestHook });

Sentry.init({
  traceLifecycle: 'static',
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  release: '1.0',
  tracesSampleRate: 1.0,
  transport: loggingTransport,
  integrations: [postgresJsIntegration],
});
