import * as api from '@opentelemetry/api';
import type { Span } from '@opentelemetry/api';
import type { TraceData } from '@sentry/core';
import { getCurrentScope } from '@sentry/core';
import { getPropagationContextFromSpan } from '../propagator';
import { generateSpanContextForPropagationContext } from './generateSpanContextForPropagationContext';

/**
 * Otel-specific implementation of `getTraceData`.
 * @see `@sentry/core` version of `getTraceData` for more information
 */
export function getTraceData(span?: Span): TraceData {
  const ctx = api.context.active();
  const spanToUse = span || api.trace.getSpan(ctx);

  // This should never happen, given we always create an ambient non-recording span if there's no active span.
  if (!spanToUse) {
    return {};
  }
  const headersObject: Record<string, string> = {};

  const propagationContext = spanToUse
    ? getPropagationContextFromSpan(spanToUse)
    : getCurrentScope().getPropagationContext();

  const spanContext = generateSpanContextForPropagationContext(propagationContext);

  const context = api.trace.setSpanContext(ctx, spanContext);

  api.propagation.inject(context, headersObject);

  if (!headersObject['sentry-trace']) {
    return {};
  }

  return {
    'sentry-trace': headersObject['sentry-trace'],
    baggage: headersObject['baggage'],
  };
}
