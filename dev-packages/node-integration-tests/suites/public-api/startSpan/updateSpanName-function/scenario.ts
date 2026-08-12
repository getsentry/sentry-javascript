import * as Sentry from '@sentry/node';
import { SENTRY_SEGMENT_NAME_SOURCE } from '@sentry/conventions/attributes';
import { loggingTransport } from '@sentry-internal/node-integration-tests';

Sentry.init({
  traceLifecycle: 'static',
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  release: '1.0',
  tracesSampleRate: 1.0,
  transport: loggingTransport,
});

Sentry.startSpan({ name: 'test_span', attributes: { [SENTRY_SEGMENT_NAME_SOURCE]: 'url' } }, (span: Sentry.Span) => {
  Sentry.updateSpanName(span, 'new name');
});
