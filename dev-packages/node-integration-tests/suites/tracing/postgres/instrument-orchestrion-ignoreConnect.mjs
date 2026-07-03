// Same orchestrion opt-in as `instrument-orchestrion.mjs`, but configuring the
// integration the normal way: `postgresIntegration({ ignoreConnectSpans: true })`.
// Because injection was opted into, `postgresIntegration()` builds the
// diagnostics-channel implementation and forwards the option to it — so connect
// spans are suppressed on the orchestrion path exactly as on the OTel one.
import { loggingTransport } from '@sentry-internal/node-integration-tests';
import * as Sentry from '@sentry/node';

const { postgresIntegration } = Sentry.diagnosticsChannelInjectionIntegrations();

Sentry.experimentalUseDiagnosticsChannelInjection();
Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  release: '1.0',
  tracesSampleRate: 1.0,
  integrations: [postgresIntegration({ ignoreConnectSpans: true })],
  transport: loggingTransport,
});
