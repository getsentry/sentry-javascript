import * as api from '@opentelemetry/api';
import type { Client, Scope, SerializedTraceData, Span } from '@sentry/core';
import {
  dynamicSamplingContextToSentryBaggageHeader,
  generateSentryTraceHeader,
  getActiveSpan,
  getCapturedScopesOnSpan,
  getCurrentScope,
  scopeToTraceparentHeader,
  spanToTraceparentHeader,
} from '@sentry/core';
import { getInjectionData } from '../propagator';
import { getContextFromScope } from './contextData';

/**
 * Otel-specific implementation of `getTraceData`.
 * @see `@sentry/core` version of `getTraceData` for more information
 */
export function getTraceData(
  options: { span?: Span; scope?: Scope; client?: Client; propagateTraceparent?: boolean } = {},
): SerializedTraceData {
  const span = options.span || getActiveSpan();
  const scope = options.scope || (span && getCapturedScopesOnSpan(span).scope) || getCurrentScope();

  let ctx = getContextFromScope(scope) ?? api.context.active();

  if (span) {
    // fall back to current context if for whatever reason we can't find the one of the span
    ctx = getContextFromScope(scope) || api.trace.setSpan(api.context.active(), span);
  }

  const { traceId, spanId, sampled, dynamicSamplingContext } = getInjectionData(ctx, { scope, client: options.client });

  const traceData: SerializedTraceData = {
    'sentry-trace': generateSentryTraceHeader(traceId, spanId, sampled),
    baggage: dynamicSamplingContextToSentryBaggageHeader(dynamicSamplingContext),
  };

  if (options.propagateTraceparent) {
    traceData.traceparent = span ? spanToTraceparentHeader(span) : scopeToTraceparentHeader(scope);
  }

  return traceData;
}
