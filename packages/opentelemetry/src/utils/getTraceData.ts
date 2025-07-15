import * as api from '@opentelemetry/api';
import type { Client, Scope, SerializedTraceData, Span } from '@sentry/core';
import {
  dynamicSamplingContextToSentryBaggageHeader,
  generateSentryTraceHeader,
  getCapturedScopesOnSpan,
} from '@sentry/core';
import { getInjectionData } from '../propagator';
import { getContextFromScope } from './contextData';

/**
 * Otel-specific implementation of `getTraceData`.
 * @see `@sentry/core` version of `getTraceData` for more information
 */
export function getTraceData({
  span,
  scope,
  client,
}: { span?: Span; scope?: Scope; client?: Client } = {}): SerializedTraceData {
  let ctx = (scope && getContextFromScope(scope)) ?? api.context.active();

  if (span) {
    const { scope } = getCapturedScopesOnSpan(span);
    // fall back to current context if for whatever reason we can't find the one of the span
    ctx = (scope && getContextFromScope(scope)) || api.trace.setSpan(api.context.active(), span);
  }

  const { traceId, spanId, sampled, dynamicSamplingContext } = getInjectionData(ctx, { scope, client });

  return {
    'sentry-trace': generateSentryTraceHeader(traceId, spanId, sampled),
    baggage: dynamicSamplingContextToSentryBaggageHeader(dynamicSamplingContext),
  };
}
