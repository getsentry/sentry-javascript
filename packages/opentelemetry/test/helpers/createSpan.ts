import type { Context, SpanContext, TimeInput } from '@opentelemetry/api';
import { SpanKind } from '@opentelemetry/api';
import type { Tracer } from '@opentelemetry/sdk-trace-base';
import { Span } from '@opentelemetry/sdk-trace-base';
import { uuid4 } from '@sentry/utils';

export function createSpan(
  name?: string,
  {
    spanId,
    parentSpanId,
    traceId,
    startTime,
  }: {
    spanId?: string;
    parentSpanId?: string;
    traceId?: string;
    startTime?: TimeInput;
  } = {},
): Span {
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
    traceId: traceId || uuid4(),
    traceFlags: 0,
  };

  // eslint-disable-next-line deprecation/deprecation
  return new Span(tracer, {} as Context, name || 'test', spanContext, SpanKind.INTERNAL, parentSpanId, [], startTime);
}
