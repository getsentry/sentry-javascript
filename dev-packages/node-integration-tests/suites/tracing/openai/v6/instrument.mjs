import * as Sentry from '@sentry/node';
import { loggingTransport } from '@sentry-internal/node-integration-tests';

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  release: '1.0',
  tracesSampleRate: 1.0,
  sendDefaultPii: false,
  transport: loggingTransport,
  integrations: [Sentry.openAIIntegration()],
  beforeSendTransaction: event => {
    if (event.transaction.includes('/openai/')) {
      return null;
    }
    return event;
  },
});
