import * as Sentry from '@sentry/node';
import { loggingTransport } from '@sentry-internal/node-integration-tests';

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  release: '1.0',
  tracesSampleRate: 1.0,
  transport: loggingTransport,
  integrations: [
    Sentry.openAIIntegration({
      onSpanStart: (span, { request }) => {
        span.setAttribute(
          'test.start',
          [request?.user, Sentry.getCurrentScope().getScopeData().tags.privacy].join(':'),
        );
      },
      onSpanEnd: (span, _call, { response }) => {
        span.setAttribute('test.end', response?.id ?? 'no response');
      },
    }),
  ],
});
