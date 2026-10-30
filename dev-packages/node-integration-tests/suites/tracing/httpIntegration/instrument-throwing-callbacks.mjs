import * as Sentry from '@sentry/node';
import { loggingTransport } from '@sentry-internal/node-integration-tests';

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  release: '1.0',
  tracesSampleRate: 1.0,
  transport: loggingTransport,

  integrations: [
    Sentry.httpIntegration({
      ignoreIncomingRequests: () => {
        throw new Error('ignoreIncomingRequests error');
      },
      onSpanCreated: () => {
        throw new Error('onSpanCreated error');
      },
      onSpanEnd: () => {
        throw new Error('onSpanEnd error');
      },
    }),
  ],
});
