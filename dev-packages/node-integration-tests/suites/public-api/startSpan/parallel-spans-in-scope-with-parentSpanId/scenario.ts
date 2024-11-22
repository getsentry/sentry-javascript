import { loggingTransport } from '@sentry-internal/node-integration-tests';
import * as Sentry from '@sentry/node';

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  release: '1.0',
  tracesSampleRate: 1.0,
  transport: loggingTransport,
});

Sentry.withScope(scope => {
  scope.setPropagationContext({
    parentSpanId: '1234567890123456',
    spanId: '123456789012345x',
    traceId: '12345678901234567890123456789012',
  });

  Sentry.startSpan({ name: 'test_span_1' }, () => undefined);
  Sentry.startSpan({ name: 'test_span_2' }, () => undefined);
});
