import { SENTRY_SEGMENT_NAME_SOURCE } from '@sentry/conventions/attributes';
import * as Sentry from '@sentry/node';
import { loggingTransport } from '@sentry-internal/node-integration-tests';

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  release: '1.0',
  tracesSampleRate: 1.0,
  traceLifecycle: 'stream',
  transport: loggingTransport,
});

Sentry.startSpan({ name: 'test_span', attributes: { [SENTRY_SEGMENT_NAME_SOURCE]: 'url' } }, (span: Sentry.Span) => {
  span.updateName('new name');
});

void Sentry.flush();
