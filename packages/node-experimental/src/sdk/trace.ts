import type { Tracer } from '@opentelemetry/api';
import { SpanStatusCode } from '@opentelemetry/api';
import { hasTracingEnabled } from '@sentry/core';
import { isThenable } from '@sentry/utils';

import { OTEL_ATTR_OP, OTEL_ATTR_ORIGIN, OTEL_ATTR_SOURCE } from '../constants';
import { setOtelSpanMetadata } from '../opentelemetry/spanData';
import type { NodeExperimentalClient, NodeExperimentalSpanContext, OtelSpan } from '../types';
import { getCurrentHub } from './hub';

/**
 * Wraps a function with a transaction/span and finishes the span after the function is done.
 * The created span is the active span and will be used as parent by other spans created inside the function
 * and can be accessed via `Sentry.getSpan()`, as long as the function is executed while the scope is active.
 *
 * If you want to create a span that is not set as active, use {@link startInactiveSpan}.
 *
 * Note that if you have not enabled tracing extensions via `addTracingExtensions`
 * or you didn't set `tracesSampleRate`, this function will not generate spans
 * and the `span` returned from the callback will be undefined.
 */
export function startSpan<T>(spanContext: NodeExperimentalSpanContext, callback: (span: OtelSpan | undefined) => T): T {
  const tracer = getTracer();
  if (!tracer) {
    return callback(undefined);
  }

  const { name } = spanContext;

  return tracer.startActiveSpan(name, (span): T => {
    function finishSpan(): void {
      span.end();
    }

    _initSpan(span as OtelSpan, spanContext);

    let maybePromiseResult: T;
    try {
      maybePromiseResult = callback(span as OtelSpan);
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
export function startInactiveSpan(spanContext: NodeExperimentalSpanContext): OtelSpan | undefined {
  const tracer = getTracer();
  if (!tracer) {
    return undefined;
  }

  const { name } = spanContext;

  const span = tracer.startSpan(name) as OtelSpan;

  _initSpan(span, spanContext);

  return span;
}

function getTracer(): Tracer | undefined {
  if (!hasTracingEnabled()) {
    return undefined;
  }

  const client = getCurrentHub().getClient<NodeExperimentalClient>();
  return client && client.tracer;
}

function _initSpan(span: OtelSpan, spanContext: NodeExperimentalSpanContext): void {
  const { origin, op, source, metadata } = spanContext;

  if (origin) {
    span.setAttribute(OTEL_ATTR_ORIGIN, origin);
  }

  if (op) {
    span.setAttribute(OTEL_ATTR_OP, op);
  }

  if (source) {
    span.setAttribute(OTEL_ATTR_SOURCE, source);
  }

  if (metadata) {
    setOtelSpanMetadata(span, metadata);
  }
}
