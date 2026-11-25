import * as Sentry from '@sentry/node';
import { loggingTransport } from '@sentry-internal/node-integration-tests';

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  release: '1.0',
  tracesSampleRate: 1.0,
  transport: loggingTransport,
  integrations: [
    Sentry.tanstackAIIntegration({
      recordInputs: ({ threadId }) => threadId === 'thread-plain',
      recordOutputs: false,
      onSpanStart: (span, { threadId }) => {
        span.setAttribute('test.start', threadId);
      },
      onSpanEnd: (span, _call, { error }) => {
        span.setAttribute('test.end', error ? 'error' : 'ok');
      },
    }),
  ],
});
