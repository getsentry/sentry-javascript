import * as Sentry from '@sentry/node';
import { loggingTransport } from '@sentry-internal/node-integration-tests';

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  release: '1.0',
  tracesSampleRate: 1.0,
  transport: loggingTransport,
  integrations: [
    Sentry.langGraphIntegration({
      onSpanStart: (span, { config }) => {
        span.setAttribute(
          'test.start',
          [config?.configurable?.privacy, Sentry.getCurrentScope().getScopeData().tags.privacy].join(':'),
        );
      },
      onSpanEnd: (span, _call, { response }) => {
        span.setAttribute('test.end', response?.messages?.at(-1)?.content ?? 'no response');
      },
    }),
  ],
});
