import { loggingTransport } from '@sentry-internal/node-integration-tests';
import * as Sentry from '@sentry/node';

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  release: '1.0',
  tracesSampleRate: 1.0,
  transport: loggingTransport,
});

Sentry.withScope(() => {
  const spanIdTraceId = Sentry.startSpan(
    {
      name: 'test_span_1',
    },
    span1 => span1.spanContext().traceId,
  );

  Sentry.startSpan(
    {
      name: 'test_span_2',
      attributes: { spanIdTraceId },
    },
    () => undefined,
  );
});
