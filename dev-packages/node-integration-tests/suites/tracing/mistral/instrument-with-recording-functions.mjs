import * as Sentry from '@sentry/node';
import { loggingTransport } from '@sentry-internal/node-integration-tests';

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  release: '1.0',
  tracesSampleRate: 1.0,
  transport: loggingTransport,
  integrations: [
    Sentry.mistralAIIntegration({
      recordInputs: ({ operation, request }) =>
        operation === 'chat' && !!request?.messages?.[0]?.content?.startsWith('Public'),
      recordOutputs: () => Sentry.getCurrentScope().getScopeData().tags.privacy === 'public',
    }),
  ],
});
