import * as Sentry from '@sentry/node';
import { loggingTransport } from '@sentry-internal/node-integration-tests';

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  release: '1.0',
  tracesSampleRate: 1.0,
  sendDefaultPii: true,
  transport: loggingTransport,
  integrations: [Sentry.googleGenAIIntegration()],
  beforeSendTransaction: event => {
    // Filter out mock express server transactions
    if (event.transaction.includes('/v1beta/')) {
      return null;
    }
    return event;
  },
});
