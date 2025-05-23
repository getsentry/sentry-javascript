import * as Sentry from '@sentry/node';
import { loggingTransport } from '@sentry-internal/node-integration-tests';

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  release: '1.0',
  tracesSampleRate: 1.0,
  transport: loggingTransport,
});

Sentry.startSpan(
  { name: 'test_span', attributes: { [Sentry.SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'url' } },
  (span: Sentry.Span) => {
    Sentry.updateSpanName(span, 'new name');
  },
);
