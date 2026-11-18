import * as Sentry from '@sentry/node';
import { loggingTransport } from '@sentry-internal/node-integration-tests';

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  release: '1.0',
  tracesSampleRate: 1.0,
  transport: loggingTransport,
  integrations: [
    Sentry.piDurableIntegration({
      recordInputs: call => call.operation === 'chat',
      recordOutputs: () => globalThis.recordOutputs,
    }),
  ],
});
