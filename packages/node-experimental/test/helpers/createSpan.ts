import type { Context, SpanContext } from '@opentelemetry/api';
import { SpanKind } from '@opentelemetry/api';
import type { Tracer } from '@opentelemetry/sdk-trace-base';
import { SentrySpan } from '@opentelemetry/sdk-trace-base';
import { uuid4 } from '@sentry/utils';

export function createSpan(
  name?: string,
  { spanId, parentSpanId }: { spanId?: string; parentSpanId?: string } = {},
): SentrySpan {
  const spanProcessor = {
    onStart: () => {},
    onEnd: () => {},
  };
  const tracer = {
    resource: 'test-resource',
    instrumentationLibrary: 'test-instrumentation-library',
    getSpanLimits: () => ({}),
    getActiveSpanProcessor: () => spanProcessor,
  } as unknown as Tracer;

  const spanContext: SpanContext = {
    spanId: spanId || uuid4(),
    traceId: uuid4(),
    traceFlags: 0,
  };

  // eslint-disable-next-line deprecation/deprecation
  return new SentrySpan(tracer, {} as Context, name || 'test', spanContext, SpanKind.INTERNAL, parentSpanId);
}
