import type { SpanContext, TimeInput } from '@opentelemetry/api';
import { SpanKind } from '@opentelemetry/api';
import type { SpanProcessor } from '@opentelemetry/sdk-trace-node';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { uuid4 } from '@sentry/core';

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
) {
  const spanProcessor: SpanProcessor = {
    onStart: () => {},
    onEnd: () => {},
    forceFlush: (() => {}) as () => Promise<void>,
    shutdown: (() => {}) as () => Promise<void>,
  };

  const provider = new NodeTracerProvider({
    spanLimits: {},
    spanProcessors: [spanProcessor],
  });

  const tracer = provider.getTracer('test-instrumentation-library');

  // const tracer = {
  //   resource: 'test-resource',
  //   instrumentationLibrary: 'test-instrumentation-library',
  //   getSpanLimits: () => ({}),
  //   getActiveSpanProcessor: () => spanProcessor,
  // } as unknown as Tracer;

  const tId = traceId || uuid4();

  const parentSpanContext: SpanContext = {
    spanId: parentSpanId || uuid4(),
    traceId: tId,
    traceFlags: 0,
  };

  const spanContext: SpanContext = {
    spanId: spanId || uuid4(),
    traceId: tId,
    traceFlags: 0,
  };

  return tracer.startSpan(
    name || 'test',
    {
      kind: SpanKind.INTERNAL,
      links: [],
      spanContext,
      startTime,
    },
    parentSpanContext,
  );
}
