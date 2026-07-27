// Same as `instrument-orchestrion.mjs`, but configuring the integration the normal way:
// `postgresIntegration({ ignoreConnectSpans: true })`. `postgresIntegration()` is the
// diagnostics-channel implementation by default and forwards the option to it, so connect spans are
// suppressed exactly as on the OTel path.
import { loggingTransport } from '@sentry-internal/node-integration-tests';
import * as Sentry from '@sentry/node';

Sentry.init({
  traceLifecycle: 'static',
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  release: '1.0',
  tracesSampleRate: 1.0,
  integrations: [Sentry.postgresIntegration({ ignoreConnectSpans: true })],
  transport: loggingTransport,
});
