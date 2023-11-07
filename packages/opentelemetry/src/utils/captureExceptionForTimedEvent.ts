import type { Span as OtelSpan, TimedEvent } from '@opentelemetry/sdk-trace-base';
import { SemanticAttributes } from '@opentelemetry/semantic-conventions';
import type { Hub } from '@sentry/types';
import { isString } from '@sentry/utils';

/**
 * Maybe capture a Sentry exception for an OTEL timed event.
 * This will check if the event is exception-like and in that case capture it as an exception.
 */
export function maybeCaptureExceptionForTimedEvent(hub: Hub, event: TimedEvent, otelSpan?: OtelSpan): void {
  if (event.name !== 'exception') {
    return;
  }

  const attributes = event.attributes;
  if (!attributes) {
    return;
  }

  const message = attributes[SemanticAttributes.EXCEPTION_MESSAGE];

  if (typeof message !== 'string') {
    return;
  }

  const syntheticError = new Error(message);

  const stack = attributes[SemanticAttributes.EXCEPTION_STACKTRACE];
  if (isString(stack)) {
    syntheticError.stack = stack;
  }

  const type = attributes[SemanticAttributes.EXCEPTION_TYPE];
  if (isString(type)) {
    syntheticError.name = type;
  }

  hub.captureException(syntheticError, {
    captureContext: otelSpan
      ? {
          contexts: {
            otel: {
              attributes: otelSpan.attributes,
              resource: otelSpan.resource.attributes,
            },
            trace: {
              trace_id: otelSpan.spanContext().traceId,
              span_id: otelSpan.spanContext().spanId,
              parent_span_id: otelSpan.parentSpanId,
            },
          },
        }
      : undefined,
  });
}
