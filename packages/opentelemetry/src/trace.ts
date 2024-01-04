import type { Span, Tracer } from '@opentelemetry/api';
import { SpanStatusCode, trace } from '@opentelemetry/api';
import { SDK_VERSION } from '@sentry/core';
import type { Client } from '@sentry/types';
import { isThenable } from '@sentry/utils';

import { getClient } from './custom/hub';
import { InternalSentrySemanticAttributes } from './semanticAttributes';
import type { OpenTelemetryClient, OpenTelemetrySpanContext } from './types';
import { setSpanMetadata } from './utils/spanData';

/**
 * Wraps a function with a transaction/span and finishes the span after the function is done.
 * The created span is the active span and will be used as parent by other spans created inside the function
 * and can be accessed via `Sentry.getSpan()`, as long as the function is executed while the scope is active.
 *
 * If you want to create a span that is not set as active, use {@link startInactiveSpan}.
 *
 * Note that you'll always get a span passed to the callback, it may just be a NonRecordingSpan if the span is not sampled.
 */
export function startSpan<T>(spanContext: OpenTelemetrySpanContext, callback: (span: Span) => T): T {
  const tracer = getTracer();

  const { name } = spanContext;

  return tracer.startActiveSpan(name, spanContext, span => {
    function finishSpan(): void {
      span.end();
    }

    _applySentryAttributesToSpan(span, spanContext);

    let maybePromiseResult: T;
    try {
      maybePromiseResult = callback(span);
    } catch (e) {
      span.setStatus({ code: SpanStatusCode.ERROR });
      finishSpan();
      throw e;
    }

    if (isThenable(maybePromiseResult)) {
      Promise.resolve(maybePromiseResult).then(
        () => {
          finishSpan();
        },
        () => {
          span.setStatus({ code: SpanStatusCode.ERROR });
          finishSpan();
        },
      );
    } else {
      finishSpan();
    }

    return maybePromiseResult;
  });
}

/**
 * Similar to `Sentry.startSpan`. Wraps a function with a span, but does not finish the span
 * after the function is done automatically. You'll have to call `span.end()` manually.
 *
 * The created span is the active span and will be used as parent by other spans created inside the function
 * and can be accessed via `Sentry.getActiveSpan()`, as long as the function is executed while the scope is active.
 *
 * Note that you'll always get a span passed to the callback, it may just be a NonRecordingSpan if the span is not sampled.
 */
export function startSpanManual<T>(spanContext: OpenTelemetrySpanContext, callback: (span: Span) => T): T {
  const tracer = getTracer();

  const { name } = spanContext;

  // @ts-expect-error - isThenable returns the wrong type
  return tracer.startActiveSpan(name, spanContext, span => {
    _applySentryAttributesToSpan(span, spanContext);

    let maybePromiseResult: T;
    try {
      maybePromiseResult = callback(span);
    } catch (e) {
      span.setStatus({ code: SpanStatusCode.ERROR });
      throw e;
    }

    if (isThenable(maybePromiseResult)) {
      return maybePromiseResult.then(
        res => res,
        e => {
          span.setStatus({ code: SpanStatusCode.ERROR });
          throw e;
        },
      );
    }

    return maybePromiseResult;
  });
}

/**
 * @deprecated Use {@link startSpan} instead.
 */
export const startActiveSpan = startSpan;

/**
 * Creates a span. This span is not set as active, so will not get automatic instrumentation spans
 * as children or be able to be accessed via `Sentry.getSpan()`.
 *
 * If you want to create a span that is set as active, use {@link startSpan}.
 *
 * Note that if you have not enabled tracing extensions via `addTracingExtensions`
 * or you didn't set `tracesSampleRate` or `tracesSampler`, this function will not generate spans
 * and the `span` returned from the callback will be undefined.
 */
export function startInactiveSpan(spanContext: OpenTelemetrySpanContext): Span {
  const tracer = getTracer();

  const { name } = spanContext;

  const span = tracer.startSpan(name, spanContext);

  _applySentryAttributesToSpan(span, spanContext);

  return span;
}

function getTracer(): Tracer {
  const client = getClient<Client & OpenTelemetryClient>();
  return (client && client.tracer) || trace.getTracer('@sentry/opentelemetry', SDK_VERSION);
}

function _applySentryAttributesToSpan(span: Span, spanContext: OpenTelemetrySpanContext): void {
  const { origin, op, source, metadata } = spanContext;

  if (origin) {
    span.setAttribute(InternalSentrySemanticAttributes.ORIGIN, origin);
  }

  if (op) {
    span.setAttribute(InternalSentrySemanticAttributes.OP, op);
  }

  if (source) {
    span.setAttribute(InternalSentrySemanticAttributes.SOURCE, source);
  }

  if (metadata) {
    setSpanMetadata(span, metadata);
  }
}
