import * as Sentry from '@sentry/node';
import { loggingTransport } from '@sentry-internal/node-integration-tests';

if (process.env.USE_ORCHESTRION) {
  Sentry.experimentalUseDiagnosticsChannelInjection();
}

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  release: '1.0',
  tracesSampleRate: 1.0,
  // inputs and outputs are enabeld by default when opting into dataCollection
  dataCollection: {},
  transport: loggingTransport,
});
