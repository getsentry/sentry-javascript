import * as Sentry from '@sentry/node';
import { loggingTransport } from '@sentry-internal/node-integration-tests';

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  release: '1.0',
  tracesSampleRate: 1.0,
  transport: loggingTransport,
});

Sentry.getCurrentScope().setPropagationContext({
  parentSpanId: '1234567890123456',
  traceId: '12345678901234567890123456789012',
  sampleRand: Math.random(),
});

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
