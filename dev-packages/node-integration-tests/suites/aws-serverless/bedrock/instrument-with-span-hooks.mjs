import * as Sentry from '@sentry/aws-serverless';
import { loggingTransport } from '@sentry-internal/node-integration-tests';

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  release: '1.0',
  tracesSampleRate: 1.0,
  integrations: [
    Sentry.awsIntegration({
      onSpanStart: (span, { input }) => {
        span.setAttribute(
          'test.start',
          [input.requestMetadata?.privacy, Sentry.getCurrentScope().getScopeData().tags.privacy].join(':'),
        );
      },
      onSpanEnd: (span, _call, { response }) => {
        span.setAttribute('test.end', response?.stopReason ?? 'no response');
      },
    }),
  ],
  transport: loggingTransport,
});
