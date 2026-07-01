import * as Sentry from '@sentry/node';
import { loggingTransport } from '@sentry-internal/node-integration-tests';

Sentry.experimentalUseDiagnosticsChannelInjection();

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  release: '1.0',
  tracesSampleRate: 1.0,
  dataCollection: { genAI: { inputs: false, outputs: false } },
  transport: loggingTransport,
  beforeSendTransaction: event => {
    if (event.transaction.includes('/anthropic/v1/')) {
      return null;
    }
    return event;
  },
});
