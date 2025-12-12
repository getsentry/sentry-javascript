import * as api from '@opentelemetry/api';
import type { Client, Scope, SerializedTraceData, Span } from '@sentry/core';
import {
  dynamicSamplingContextToSentryBaggageHeader,
  generateSentryTraceHeader,
  getCapturedScopesOnSpan,
  scopeToTraceparentHeader,
  spanToTraceparentHeader,
} from '@sentry/core';
import { getInjectionData } from '../propagator';
import { getContextFromScope, getScopesFromContext } from './contextData';

/**
 * Otel-specific implementation of `getTraceData`.
 * @see `@sentry/core` version of `getTraceData` for more information
 */
export function getTraceData(options: { span?: Span; scope?: Scope; client?: Client; propagateTraceparent?: boolean } = {}): SerializedTraceData {
  const { client, propagateTraceparent } = options;
  let { span, scope } = options;

  let ctx = (scope && getContextFromScope(scope)) ?? api.context.active();

  if (span) {
    const { scope } = getCapturedScopesOnSpan(span);
    // fall back to current context if for whatever reason we can't find the one of the span
    ctx = (scope && getContextFromScope(scope)) || api.trace.setSpan(api.context.active(), span);
  } else {
    span = api.trace.getSpan(ctx);
  }

  if (!scope) {
    const scopes = getScopesFromContext(ctx);
    if (scopes) {
      scope = scopes.scope;
    }
  }

  const { traceId, spanId, sampled, dynamicSamplingContext } = getInjectionData(ctx, { scope, client });

  const traceData: SerializedTraceData = {
    'sentry-trace': generateSentryTraceHeader(traceId, spanId, sampled),
    baggage: dynamicSamplingContextToSentryBaggageHeader(dynamicSamplingContext),
  };

  if (propagateTraceparent) {
    if (span) {
      traceData.traceparent = spanToTraceparentHeader(span);
    } else if (scope) {
      traceData.traceparent = scopeToTraceparentHeader(scope);
    }
  }

  return traceData;
}
