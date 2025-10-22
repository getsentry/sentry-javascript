import * as Sentry from '@sentry/node';
import { loggingTransport } from '@sentry-internal/node-integration-tests';

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  release: '1.0',
  tracesSampleRate: 1.0,
  sendDefaultPii: false,
  transport: loggingTransport,
  // Filter out Anthropic integration to avoid duplicate spans with LangChain
  integrations: integrations => integrations.filter(integration => integration.name !== 'Anthropic_AI'),
  beforeSendTransaction: event => {
    // Filter out mock express server transactions
    if (event.transaction.includes('/v1/messages')) {
      return null;
    }
    return event;
  },
});
