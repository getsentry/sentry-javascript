import * as api from '@opentelemetry/api';
import { dropUndefinedKeys } from '@sentry/core';
import type { SerializedTraceData } from '@sentry/types';

/**
 * Otel-specific implementation of `getTraceData`.
 * @see `@sentry/core` version of `getTraceData` for more information
 */
export function getTraceData({ span }: { span?: Span } = {}): SerializedTraceData {
  let ctx = api.context.active();

  if (span) {
    const { scope } = getCapturedScopesOnSpan(span);
    // fall back to current context if for whatever reason we can't find the one of the span
    ctx = (scope && getContextFromScope(scope)) || api.trace.setSpan(api.context.active(), span);
  }

  const { traceId, spanId, sampled, dynamicSamplingContext } = getInjectionData(ctx);

  return {
    'sentry-trace': generateSentryTraceHeader(traceId, spanId, sampled),
    baggage: dynamicSamplingContextToSentryBaggageHeader(dynamicSamplingContext),
  };
}
