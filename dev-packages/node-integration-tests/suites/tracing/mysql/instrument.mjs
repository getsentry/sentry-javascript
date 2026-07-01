import * as Sentry from '@sentry/node';
import { loggingTransport } from '@sentry-internal/node-integration-tests';

if (process.env.ORCHESTRION === 'true') {
  Sentry.experimentalUseDiagnosticsChannelInjection();
}

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  release: '1.0',
  tracesSampleRate: 1.0,
  transport: loggingTransport,
  traceLifecycle: process.env.STREAMED === 'true' ? 'stream' : undefined,
});
