import type { SpanContext, TimeInput } from '@opentelemetry/api';
import { context, trace, SpanKind } from '@opentelemetry/api';
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
  const tId = traceId || uuid4();

  const parentSpan = tracer.startSpan(name || 'test', {
    kind: SpanKind.INTERNAL,
    links: [],
    startTime,
  });

  parentSpan.spanContext().spanId = parentSpanId || uuid4();
  parentSpan.spanContext().traceId = tId;
  parentSpan.spanContext().traceFlags = 0;

  trace.setSpan(context.active(), parentSpan);

  const childSpan = tracer.startSpan(name || 'test', {
    kind: SpanKind.INTERNAL,
    links: [],
    startTime,
  });

  childSpan.spanContext().spanId = spanId || uuid4();
  childSpan.spanContext().traceId = tId;
  childSpan.spanContext().traceFlags = 0;

  return childSpan;
}
